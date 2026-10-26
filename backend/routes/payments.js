const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");

const router = express.Router();

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }

  try {
    const decoded = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET
    );

    req.userId =
      decoded.id ||
      decoded.userId ||
      decoded._id ||
      decoded.sub;

    if (!mongoose.isValidObjectId(req.userId)) {
      return res.status(401).json({
        message: "Invalid authentication token."
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token."
    });
  }
}

router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const payments = await Payment.find({
      user: req.userId
    })
      .populate(
        "invoice",
        "description amountInPaise status dueDate billingPeriodStart billingPeriodEnd"
      )
      .sort({ createdAt: -1 });

    return res.json({
      payments,
      count: payments.length
    });
  } catch (error) {
    console.error("Payment history error:", error.message);

    return res.status(500).json({
      message: "Could not load payment history."
    });
  }
});

router.post("/:invoiceId/attempt", async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { outcome } = req.body;

    if (!mongoose.isValidObjectId(invoiceId)) {
      return res.status(400).json({
        message: "Invalid invoice ID."
      });
    }

    if (!["success", "failure"].includes(outcome)) {
      return res.status(400).json({
        message: 'Outcome must be either "success" or "failure".'
      });
    }

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      user: req.userId
    });

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found."
      });
    }

    if (["paid", "void"].includes(invoice.status)) {
      return res.status(400).json({
        message: "This invoice cannot accept another payment attempt."
      });
    }

    if (invoice.dunningStatus === "exhausted") {
      return res.status(400).json({
        message: "Dunning is exhausted for this invoice."
      });
    }

    if (
      !Number.isSafeInteger(invoice.amountInPaise) ||
      invoice.amountInPaise <= 0
    ) {
      return res.status(400).json({
        message: "Invoice amount must be a positive integer in paise."
      });
    }

    const now = new Date();

    if (
      !invoice.billingPeriodStart ||
      Number.isNaN(new Date(invoice.billingPeriodStart).getTime())
    ) {
      return res.status(400).json({
        message: "Invoice billing period start is invalid."
      });
    }

    if (new Date(invoice.billingPeriodStart) > now) {
      return res.status(400).json({
        message: "Payment is not allowed before the billing period starts."
      });
    }

    const payment = await Payment.create({
      user: req.userId,
      invoice: invoice._id,
      amountInPaise: invoice.amountInPaise,
      currency: invoice.currency,
      provider: "mock",
      status: outcome === "success" ? "succeeded" : "failed",
      failureReason:
        outcome === "failure"
          ? "Simulated payment failure"
          : null,
      paidAt: outcome === "success" ? now : null
    });

    if (outcome === "success") {
      invoice.status = "paid";
      invoice.paidAt = now;
      invoice.dunningStatus = "recovered";
      invoice.nextRetryAt = null;

      await invoice.save();

      const subscription = await Subscription.findOne({
        _id: invoice.subscription,
        user: req.userId
      });

      if (subscription && subscription.status === "past_due") {
        subscription.status = "active";
        await subscription.save();
      }

      return res.json({
        message: "Mock payment succeeded. Automatic retries stopped.",
        payment,
        invoice,
        subscriptionStatus: subscription
          ? subscription.status
          : null
      });
    }

    invoice.status = "past_due";

    if (!invoice.firstFailedAt) {
      invoice.firstFailedAt = now;
      invoice.retryCount = 0;
      invoice.nextRetryAt = new Date(
        now.getTime() + 24 * 60 * 60 * 1000
      );
      invoice.dunningStatus = "retrying";
    } else if (invoice.dunningStatus === "not_started") {
      invoice.dunningStatus = "retrying";
      invoice.nextRetryAt = new Date(
        now.getTime() + 24 * 60 * 60 * 1000
      );
    }

    await invoice.save();

    const subscription = await Subscription.findOne({
      _id: invoice.subscription,
      user: req.userId
    });

    if (subscription && subscription.status === "active") {
      subscription.status = "past_due";
      await subscription.save();
    }

    return res.json({
      message:
        "Mock payment failed. Automatic dunning retries have been scheduled.",
      payment,
      invoice,
      subscriptionStatus: subscription
        ? subscription.status
        : null
    });
  } catch (error) {
    console.error("Payment attempt error:", error.message);

    return res.status(500).json({
      message: "Could not process payment attempt."
    });
  }
});

module.exports = router;
