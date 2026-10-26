
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Subscription = require("../models/Subscription");
const PlanChange = require("../models/PlanChange");
const Invoice = require("../models/Invoice");

const router = express.Router();

const demoSubscriptions = [
    {
        name: "Netflix",
        planName: "Premium",
        priceInPaise: 64900,
        color: "#E50914",
        icon: "film",
        status: "active"
    },
    {
        name: "Prime Video",
        planName: "Monthly",
        priceInPaise: 29900,
        color: "#3295D8",
        icon: "play",
        status: "active"
    },
    {
        name: "YouTube Premium",
        planName: "Individual",
        priceInPaise: 14900,
        color: "#FF0000",
        icon: "play",
        status: "past_due"
    },
    {
        name: "Jio Cinema",
        planName: "Premium",
        priceInPaise: 89900,
        color: "#7656C8",
        icon: "tv",
        status: "active"
    },
    {
        name: "Disney+ Hotstar",
        planName: "Super",
        priceInPaise: 29900,
        color: "#1766C1",
        icon: "star",
        status: "active"
    }
];

const planCatalog = {
    "Netflix": [
        { planName: "Basic", priceInPaise: 19900 },
        { planName: "Standard", priceInPaise: 49900 },
        { planName: "Premium", priceInPaise: 64900 }
    ],
    "Prime Video": [
        { planName: "Mobile", priceInPaise: 14900 },
        { planName: "Monthly", priceInPaise: 29900 },
        { planName: "Premium", priceInPaise: 49900 }
    ],
    "YouTube Premium": [
        { planName: "Lite", priceInPaise: 8990 },
        { planName: "Individual", priceInPaise: 14900 },
        { planName: "Family", priceInPaise: 29900 }
    ],
    "Jio Cinema": [
        { planName: "Mobile", priceInPaise: 29900 },
        { planName: "Premium", priceInPaise: 89900 },
        { planName: "Family", priceInPaise: 149900 }
    ],
    "Disney+ Hotstar": [
        { planName: "Mobile", priceInPaise: 14900 },
        { planName: "Super", priceInPaise: 29900 },
        { planName: "Premium", priceInPaise: 49900 }
    ]
};

function authenticate(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Please log in to continue."
        });
    }

    try {
        req.user = jwt.verify(
            header.slice(7),
            process.env.JWT_SECRET
        );

        next();
    } catch {
        return res.status(401).json({
            message: "Session invalid or expired. Please log in again."
        });
    }
}

function getUserId(req) {
    return req.user.id ||
        req.user.userId ||
        req.user._id ||
        req.user.sub;
}


async function ensureDemoSubscriptions(userId) {
    const existing = await Subscription.exists({ user: userId });

    if (existing) {
        return;
    }

    const now = new Date();
    const nextBillingDate = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    await Subscription.insertMany(
        demoSubscriptions.map(subscription => ({
            ...subscription,
            user: userId,
            currentPeriodStart: now,
            nextBillingDate
        }))
    );
}


router.use(authenticate);

router.get("/", async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(401).json({
                message: "Invalid user session."
            });
        }

        await ensureDemoSubscriptions(userId);

        const subscriptions = await Subscription.find({
            user: userId
        }).sort({ createdAt: 1 });

        const monthlyTotalInPaise = subscriptions.reduce(
            (total, subscription) => {
                return subscription.status === "active"
                    ? total + subscription.priceInPaise
                    : total;
            },
            0
        );

        return res.json({
            subscriptions: subscriptions.map(subscription => ({
                id: subscription._id.toString(),
                name: subscription.name,
                planName: subscription.planName,
                priceInPaise: subscription.priceInPaise,
                color: subscription.color,
                icon: subscription.icon,
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                nextBillingDate: subscription.nextBillingDate,
                billingHistory: subscription.billingHistory
            })),
            monthlyTotalInPaise
        });
    } catch (error) {
        console.error("Subscriptions fetch error:", error.message);

        return res.status(500).json({
            message: "Unable to load subscriptions."
        });
    }
});

router.get("/:id/plans", async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!mongoose.isValidObjectId(userId) ||
            !mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid user or subscription ID."
            });
        }

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: userId
        });

        if (!subscription) {
            return res.status(404).json({
                message: "Subscription not found."
            });
        }

        return res.json({
            subscriptionId: subscription._id.toString(),
            currentPlan: subscription.planName,
            currentPriceInPaise: subscription.priceInPaise,
            plans: planCatalog[subscription.name] || []
        });
    } catch (error) {
        console.error("Plan catalog error:", error.message);

        return res.status(500).json({
            message: "Unable to load available plans."
        });
    }
});

router.post("/:id/change-plan", async (req, res) => {
    let createdInvoiceId = null;
    let createdHistoryId = null;
    let originalSubscription = null;

    try {
        const userId = getUserId(req);

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(401).json({
                message: "Invalid user session."
            });
        }

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid subscription ID."
            });
        }

        const { planName } = req.body;

        if (typeof planName !== "string" || !planName.trim()) {
            return res.status(400).json({
                message: "Choose a valid plan."
            });
        }

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: userId
        });

        if (!subscription) {
            return res.status(404).json({
                message: "Subscription not found."
            });
        }

        if (subscription.status !== "active") {
            return res.status(400).json({
                message: "Only active subscriptions can change plans."
            });
        }

        const availablePlans = planCatalog[subscription.name] || [];

        const selectedPlan = availablePlans.find(
            plan => plan.planName === planName.trim()
        );

        if (!selectedPlan) {
            return res.status(400).json({
                message: "That plan is not available for this subscription."
            });
        }

        if (selectedPlan.planName === subscription.planName) {
            return res.status(400).json({
                message: "You are already using this plan."
            });
        }

        if (
            !Number.isSafeInteger(subscription.priceInPaise) ||
            !Number.isSafeInteger(selectedPlan.priceInPaise)
        ) {
            return res.status(400).json({
                message: "Invalid subscription price."
            });
        }

        const now = new Date();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const PERIOD_MS = 30 * DAY_MS;

        let periodEnd = subscription.nextBillingDate
            ? new Date(subscription.nextBillingDate)
            : new Date(now.getTime() + PERIOD_MS);

        if (Number.isNaN(periodEnd.getTime()) || periodEnd <= now) {
            periodEnd = new Date(now.getTime() + PERIOD_MS);
        }

        let periodStart = subscription.currentPeriodStart
            ? new Date(subscription.currentPeriodStart)
            : new Date(periodEnd.getTime() - PERIOD_MS);

        if (
            Number.isNaN(periodStart.getTime()) ||
            periodStart >= now ||
            periodStart >= periodEnd
        ) {
            periodStart = new Date(periodEnd.getTime() - PERIOD_MS);
        }

        const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();

        const remainingMs = Math.max(
            0,
            Math.min(
                periodEnd.getTime() - now.getTime(),
                totalPeriodMs
            )
        );

        const remainingFraction = totalPeriodMs > 0
            ? remainingMs / totalPeriodMs
            : 0;

        const oldPrice = subscription.priceInPaise;
        const newPrice = selectedPlan.priceInPaise;
        const priceDifference = newPrice - oldPrice;

        const adjustmentInPaise = Math.round(
            Math.abs(priceDifference) * remainingFraction
        );

        const changeType = priceDifference > 0
            ? "upgrade"
            : "downgrade";

        const adjustmentType = adjustmentInPaise === 0
            ? "none"
            : priceDifference > 0
                ? "charge"
                : "credit";

        originalSubscription = {
            planName: subscription.planName,
            priceInPaise: subscription.priceInPaise,
            currentPeriodStart: subscription.currentPeriodStart,
            nextBillingDate: subscription.nextBillingDate
        };

        let prorationInvoice = null;

        if (adjustmentType === "charge" && adjustmentInPaise > 0) {
            prorationInvoice = await Invoice.create({
                user: userId,
                subscription: subscription._id,
                description:
                    `Proration - ${subscription.name}: ` +
                    `${subscription.planName} to ${selectedPlan.planName}`,
                amountInPaise: adjustmentInPaise,
                currency: "INR",
                billingPeriodStart: now,
                billingPeriodEnd: periodEnd,
                dueDate: new Date(now.getTime() + 7 * DAY_MS),
                status: "open"
            });

            createdInvoiceId = prorationInvoice._id;
        }

        const history = new PlanChange({
            user: userId,
            subscription: subscription._id,
            oldPlanName: subscription.planName,
            newPlanName: selectedPlan.planName,
            oldPriceInPaise: oldPrice,
            newPriceInPaise: newPrice,
            changeType,
            adjustmentType,
            adjustmentInPaise,
            prorationInvoice: prorationInvoice
                ? prorationInvoice._id
                : null,
            remainingFraction,
            periodStart,
            periodEnd
        });

        await history.save();
        createdHistoryId = history._id;

        subscription.planName = selectedPlan.planName;
        subscription.priceInPaise = selectedPlan.priceInPaise;
        subscription.currentPeriodStart = periodStart;
        subscription.nextBillingDate = periodEnd;

        await subscription.save();

        return res.json({
            message: "Plan changed successfully.",
            subscription: {
                id: subscription._id.toString(),
                name: subscription.name,
                planName: subscription.planName,
                priceInPaise: subscription.priceInPaise,
                currentPeriodStart: subscription.currentPeriodStart,
                nextBillingDate: subscription.nextBillingDate
            },
            planChange: {
                id: history._id.toString(),
                oldPlanName: history.oldPlanName,
                newPlanName: history.newPlanName,
                changeType: history.changeType,
                adjustmentType: history.adjustmentType,
                adjustmentInPaise: history.adjustmentInPaise,
                prorationInvoiceId: prorationInvoice
                    ? prorationInvoice._id.toString()
                    : null,
                remainingFraction: history.remainingFraction,
                periodStart: history.periodStart,
                periodEnd: history.periodEnd
            },
            invoice: prorationInvoice
                ? {
                    id: prorationInvoice._id.toString(),
                    description: prorationInvoice.description,
                    amountInPaise: prorationInvoice.amountInPaise,
                    status: prorationInvoice.status,
                    dueDate: prorationInvoice.dueDate
                }
                : null,
            note: "Upgrade charges create an open proration invoice. Downgrade credits are recorded in history only. No real payment or refund was processed."
        });
    } catch (error) {
        console.error("Plan change error:", error.message);

        try {
            if (createdHistoryId) {
                await PlanChange.deleteOne({ _id: createdHistoryId });
            }

            if (createdInvoiceId) {
                await Invoice.deleteOne({ _id: createdInvoiceId });
            }

            if (originalSubscription) {
                await Subscription.updateOne(
                    {
                        _id: req.params.id,
                        user: getUserId(req)
                    },
                    {
                        $set: originalSubscription
                    }
                );
            }
        } catch (rollbackError) {
            console.error(
                "Plan change rollback error:",
                rollbackError.message
            );
        }

        return res.status(500).json({
            message: "Unable to complete the plan change."
        });
    }
});

router.get("/:id/changes", async (req, res) => {
    try {
        const userId = getUserId(req);

        if (
            !mongoose.isValidObjectId(userId) ||
            !mongoose.isValidObjectId(req.params.id)
        ) {
            return res.status(400).json({
                message: "Invalid user or subscription ID."
            });
        }

        const subscription = await Subscription.exists({
            _id: req.params.id,
            user: userId
        });

        if (!subscription) {
            return res.status(404).json({
                message: "Subscription not found."
            });
        }

        const changes = await PlanChange.find({
            subscription: req.params.id,
            user: userId
        }).sort({ createdAt: -1 });

        return res.json({
            changes,
            count: changes.length
        });
    } catch (error) {
        console.error("Plan change history error:", error.message);

        return res.status(500).json({
            message: "Unable to load plan change history."
        });
    }
});

router.patch("/:id/cancel", async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(401).json({
                message: "Invalid user session."
            });
        }

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid subscription ID."
            });
        }

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: userId
        });

        if (!subscription) {
            return res.status(404).json({
                message: "Subscription not found."
            });
        }

        if (subscription.status === "canceled") {
            return res.status(400).json({
                message: "This subscription is already canceled."
            });
        }

        subscription.status = "canceled";
        await subscription.save();

        return res.json({
            message: "Subscription canceled successfully.",
            subscription: {
                id: subscription._id.toString(),
                name: subscription.name,
                planName: subscription.planName,
                priceInPaise: subscription.priceInPaise,
                status: subscription.status
            }
        });
    } catch (error) {
        console.error("Subscription cancellation error:", error.message);

        return res.status(500).json({
            message: "Unable to cancel subscription."
        });
    }
});

module.exports = router;
