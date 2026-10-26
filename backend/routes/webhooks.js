
const express = require("express");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const WebhookEvent = require("../models/WebhookEvent");

const router = express.Router();

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

router.post("/mock", async (req, res) => {
  const expectedSecret = process.env.MOCK_WEBHOOK_SECRET;
  const receivedSecret = req.get("x-webhook-secret");

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return res.status(401).json({
      message: "Invalid webhook secret."
    });
  }

  const { eventId, type, invoiceId } = req.body;

  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    !["payment.succeeded", "payment.failed"].includes(type) ||
    !mongoose.isValidObjectId(invoiceId)
  ) {
    return res.status(400).json({
      message: "Provide a unique eventId, valid event type, and invoiceId."
    });
  }

  let event;

  try {
    try {
      event = await WebhookEvent.create({
        eventId: eventId.trim(),
        type,
        invoice: invoiceId,
        status: "processing"
      });
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      event = await WebhookEvent.findOne({ eventId: eventId.trim() });

      if (!event) {
        throw error;
      }

      if (event.status === "processed") {
        return res.json({
          message: "Duplicate event ignored. It was already processed.",
          duplicate: true,
          eventId: event.eventId,
          status: event.status
        });
      }

      if (event.status === "processing") {
        return res.status(202).json({
          message: "This event is already being processed.",
          duplicate: true,
          eventId: event.eventId,
          status: event.status
        });
      }

      event.status = "processing";
      await event.save();
    }

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      event.status = "failed";
      event.resultMessage = "Invoice not found.";
      await event.save();

      return res.status(404).json({
        message: "Invoice not found.",
        eventId: event.eventId
      });
    }

    if (invoice.status === "void") {
      event.status = "processed";
      event.resultMessage = "Ignored because the invoice is void.";
      event.processedAt = new Date();
      await event.save();

      return res.json({
        message: event.resultMessage,
        eventId: event.eventId,
        invoice
      });
    }

    if (invoice.status === "paid") {
      event.status = "processed";
      event.resultMessage = "Invoice was already paid; no duplicate payment created.";
      event.processedAt = new Date();
      await event.save();

      return res.json({
        message: event.resultMessage,
        eventId: event.eventId,
        invoice
      });
    }

    const now = new Date();
    const succeeded = type === "payment.succeeded";

    await Payment.create({
      user: invoice.user,
      invoice: invoice._id,
      amountInPaise: invoice.amountInPaise,
      currency: invoice.currency,
      provider: "mock",
      status: succeeded ? "succeeded" : "failed",
      failureReason: succeeded ? null : "Payment failure reported by mock webhook",
      paidAt: succeeded ? now : null
    });

    if (succeeded) {
      invoice.status = "paid";
      invoice.paidAt = now;
      invoice.dunningStatus = "recovered";
      invoice.nextRetryAt = null;
    } else {
      invoice.status = "past_due";

      if (!invoice.firstFailedAt) {
        invoice.firstFailedAt = now;
        invoice.retryCount = 0;
        invoice.nextRetryAt = addDays(now, 1);
        invoice.dunningStatus = "retrying";
      } else if (
        invoice.dunningStatus === "not_started" &&
        invoice.retryCount < 4
      ) {
        invoice.nextRetryAt = addDays(now, 1);
        invoice.dunningStatus = "retrying";
      }
    }

    await invoice.save();

    event.status = "processed";
    event.resultMessage = succeeded
      ? "Payment success event processed."
      : "Payment failure event processed.";
    event.processedAt = new Date();
    await event.save();

    return res.json({
      message: event.resultMessage,
      duplicate: false,
      eventId: event.eventId,
      invoice,
      dunning: {
        status: invoice.dunningStatus,
        retryCount: invoice.retryCount,
        nextRetryAt: invoice.nextRetryAt
      }
    });
  } catch (error) {
    console.error("Mock webhook error:", error.message);

    if (event) {
      try {
        event.status = "failed";
        event.resultMessage = "Processing failed; event can be retried.";
        await event.save();
      } catch (saveError) {
        console.error("Could not update webhook event:", saveError.message);
      }
    }

    return res.status(500).json({
      message: "Could not process webhook event."
    });
  }
});

router.get("/events", async (req, res) => {
  const expectedSecret = process.env.MOCK_WEBHOOK_SECRET;

  if (!expectedSecret || req.get("x-webhook-secret") !== expectedSecret) {
    return res.status(401).json({
      message: "Invalid webhook secret."
    });
  }

  try {
    const events = await WebhookEvent.find()
      .populate("invoice", "description status amountInPaise")
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ events, count: events.length });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load webhook events."
    });
  }
});

module.exports = router;
