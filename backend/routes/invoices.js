
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Invoice = require("../models/Invoice");
const Subscription = require("../models/Subscription");

const router = express.Router();

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Authentication token required."
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(403).json({
        message: "Invalid or expired authentication token."
      });
    }

    req.user = decoded;
    next();
  });
}

function getUserId(req) {
  return req.user?.userId || req.user?.id || req.user?._id || req.user?.sub;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

router.use(authenticateToken);

/*
  GET /api/invoices
  Get all invoices belonging to the logged-in user.
*/
router.get("/", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        message: "Invalid user session."
      });
    }

    const invoices = await Invoice.find({
      user: userId
    })
      .populate("subscription", "name planName")
      .sort({ createdAt: -1 });

    return res.json({
      invoices,
      count: invoices.length
    });
  } catch (error) {
    console.error("Get invoices error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve invoices."
    });
  }
});

/*
  GET /api/invoices/subscription/:subscriptionId/history

  Get the real invoice and billing history for one subscription.
  This route must appear BEFORE GET /:id.
*/
router.get(
  "/subscription/:subscriptionId/history",
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { subscriptionId } = req.params;

      if (
        !isValidObjectId(userId) ||
        !isValidObjectId(subscriptionId)
      ) {
        return res.status(400).json({
          message: "Invalid user or subscription ID."
        });
      }

      const subscription = await Subscription.findOne({
        _id: subscriptionId,
        user: userId
      });

      if (!subscription) {
        return res.status(404).json({
          message: "Subscription not found."
        });
      }

      const invoices = await Invoice.find({
        user: userId,
        subscription: subscriptionId
      }).sort({
        billingPeriodStart: -1,
        createdAt: -1
      });

      return res.json({
        subscription: {
          id: subscription._id.toString(),
          name: subscription.name,
          planName: subscription.planName
        },
        invoices: invoices.map((invoice) => ({
          id: invoice._id.toString(),
          description: invoice.description,
          amountInPaise: invoice.amountInPaise,
          currency: invoice.currency,
          billingPeriodStart: invoice.billingPeriodStart,
          billingPeriodEnd: invoice.billingPeriodEnd,
          dueDate: invoice.dueDate,
          status: invoice.status,
          paidAt: invoice.paidAt,
          firstFailedAt: invoice.firstFailedAt,
          retryCount: invoice.retryCount,
          nextRetryAt: invoice.nextRetryAt,
          dunningStatus: invoice.dunningStatus,
          createdAt: invoice.createdAt
        })),
        count: invoices.length
      });
    } catch (error) {
      console.error("Billing history error:", error.message);

      return res.status(500).json({
        message: "Unable to retrieve billing history."
      });
    }
  }
);

/*
  GET /api/invoices/:id
  Get one invoice belonging to the logged-in user.
*/
router.get("/:id", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        message: "Invalid user session."
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid invoice ID."
      });
    }

    const invoice = await Invoice.findOne({
      _id: id,
      user: userId
    }).populate("subscription", "name planName");

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found."
      });
    }

    return res.json({
      invoice
    });
  } catch (error) {
    console.error("Get invoice error:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve invoice."
    });
  }
});

/*
  POST /api/invoices/generate

  Generate an invoice for a subscription.

  Expected body:
  {
    "subscriptionId": "...",
    "billingPeriodStart": "...",
    "billingPeriodEnd": "...",
    "dueDate": "..."
  }
*/
router.post("/generate", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        message: "Invalid user session."
      });
    }

    const {
      subscriptionId,
      billingPeriodStart,
      billingPeriodEnd,
      dueDate
    } = req.body;

    if (!isValidObjectId(subscriptionId)) {
      return res.status(400).json({
        message: "A valid subscription ID is required."
      });
    }

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription not found."
      });
    }

    if (subscription.status === "canceled") {
      return res.status(400).json({
        message: "Cannot generate an invoice for a canceled subscription."
      });
    }

    const periodStart = parseDate(billingPeriodStart);
    const periodEnd = parseDate(billingPeriodEnd);
    const invoiceDueDate = parseDate(dueDate);

    if (!periodStart || !periodEnd || !invoiceDueDate) {
      return res.status(400).json({
        message:
          "Valid billingPeriodStart, billingPeriodEnd, and dueDate are required."
      });
    }

    if (periodEnd <= periodStart) {
      return res.status(400).json({
        message: "Billing period end must be after its start."
      });
    }

    const amountInPaise = Number(
      subscription.priceInPaise ??
      subscription.amountInPaise ??
      (subscription.price != null
        ? Math.round(Number(subscription.price) * 100)
        : NaN)
    );

    if (
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise < 0
    ) {
      return res.status(400).json({
        message:
          "The subscription does not have a valid price in paise."
      });
    }

    const existingInvoice = await Invoice.findOne({
      user: userId,
      subscription: subscriptionId,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd
    });

    if (existingInvoice) {
      return res.status(409).json({
        message: "An invoice already exists for this billing period.",
        invoice: existingInvoice
      });
    }

    const subscriptionName =
      subscription.name || subscription.planName || "Subscription";

    const invoice = await Invoice.create({
      user: userId,
      subscription: subscriptionId,
      description: `${subscriptionName} subscription billing`,
      amountInPaise,
      currency: "INR",
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      dueDate: invoiceDueDate,
      status: "open",
      paidAt: null,
      firstFailedAt: null,
      retryCount: 0,
      nextRetryAt: null,
      dunningStatus: "not_started"
    });

    return res.status(201).json({
      message: "Invoice generated successfully.",
      invoice
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An invoice already exists for this billing period."
      });
    }

    console.error("Generate invoice error:", error.message);

    return res.status(500).json({
      message: "Unable to generate invoice."
    });
  }
});

module.exports = router;
