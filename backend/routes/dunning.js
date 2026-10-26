
const express = require("express");
const jwt = require("jsonwebtoken");
const Invoice = require("../models/Invoice");
const { processInvoiceRetry } = require("../services/dunning");

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
      header.split(" ")[1],
      process.env.JWT_SECRET
    );

    req.userId =
      decoded.id || decoded.userId || decoded._id || decoded.sub;

    if (!req.userId) {
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

router.get("/status/:invoiceId", async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.invoiceId,
      user: req.userId
    }).select(
      "description status firstFailedAt retryCount nextRetryAt dunningStatus subscription billingPeriodStart"
    );

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found."
      });
    }

    return res.json({ invoice });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load dunning status."
    });
  }
});

router.post("/test/:invoiceId", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({
      message: "Route not found."
    });
  }

  try {
    const { mode, outcome } = req.body;

    if (!["one-retry", "full-failure", "recovery"].includes(mode)) {
      return res.status(400).json({
        message:
          'Mode must be "one-retry", "full-failure", or "recovery".'
      });
    }

    const invoice = await Invoice.findOne({
      _id: req.params.invoiceId,
      user: req.userId
    });

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found."
      });
    }

    if (["paid", "void"].includes(invoice.status)) {
      return res.status(400).json({
        message: "Choose an unpaid invoice for the dunning test."
      });
    }

    if (mode === "full-failure" && outcome !== "failure") {
      return res.status(400).json({
        message: 'Use outcome "failure" for the full-failure test.'
      });
    }

    const now = new Date();

    if (
      !invoice.billingPeriodStart ||
      Number.isNaN(new Date(invoice.billingPeriodStart).getTime())
    ) {
      return res.status(400).json({
        message: "Invoice has no valid billing period start date."
      });
    }

    if (new Date(invoice.billingPeriodStart) > now) {
      return res.status(400).json({
        message:
          "Retry is not allowed before the billing period starts."
      });
    }

    // Only modify the invoice after validating its billing period.
    invoice.status = "past_due";
    invoice.firstFailedAt =
      invoice.firstFailedAt ||
      new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    invoice.dunningStatus = "retrying";
    invoice.nextRetryAt = now;

    if (mode === "full-failure") {
      invoice.retryCount = 0;
      await invoice.save();

      const results = [];

      for (let i = 0; i < 4; i += 1) {
        const currentInvoice = await Invoice.findOne({
          _id: invoice._id,
          user: req.userId
        });

        if (
          !currentInvoice ||
          currentInvoice.status === "paid" ||
          currentInvoice.dunningStatus !== "retrying"
        ) {
          break;
        }

        if (
          !currentInvoice.billingPeriodStart ||
          new Date(currentInvoice.billingPeriodStart) > new Date()
        ) {
          results.push({
            processed: false,
            reason:
              "Retry is not allowed before the billing period starts."
          });
          break;
        }

        currentInvoice.nextRetryAt = new Date();
        await currentInvoice.save();

        const result = await processInvoiceRetry(
          currentInvoice,
          "failure"
        );

        results.push(result);

        if (!result.processed) {
          break;
        }
      }

      const finalInvoice = await Invoice.findOne({
        _id: invoice._id,
        user: req.userId
      });

      return res.json({
        message: "Full-failure simulation completed.",
        results,
        invoice: finalInvoice
      });
    }

    if (mode === "recovery") {
      invoice.retryCount = 0;
    }

    await invoice.save();

    const result = await processInvoiceRetry(
      invoice,
      mode === "recovery" ? "success" : outcome
    );

    const updatedInvoice = await Invoice.findOne({
      _id: invoice._id,
      user: req.userId
    });

    return res.json({
      message: "Dunning simulation completed.",
      result,
      invoice: updatedInvoice
    });
  } catch (error) {
    console.error("Dunning test error:", error.message);

    return res.status(500).json({
      message: "Could not run dunning test."
    });
  }
});

module.exports = router;
