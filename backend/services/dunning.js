
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");

const RETRY_DAYS = [1, 3, 5, 7];
const MAX_RETRIES = RETRY_DAYS.length;

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function processInvoiceRetry(invoice, forcedOutcome) {
  if (
    invoice.status !== "past_due" ||
    invoice.dunningStatus !== "retrying" ||
    invoice.retryCount >= MAX_RETRIES
  ) {
    return {
      processed: false,
      reason: "Invoice is not eligible for retry."
    };
  }

  const now = new Date();

  if (
    !invoice.billingPeriodStart ||
    Number.isNaN(new Date(invoice.billingPeriodStart).getTime())
  ) {
    return {
      processed: false,
      reason: "Invoice has no valid billing period start date."
    };
  }

  if (new Date(invoice.billingPeriodStart) > now) {
    return {
      processed: false,
      reason: "Retry is not allowed before the billing period starts."
    };
  }

  if (
    !invoice.nextRetryAt ||
    new Date(invoice.nextRetryAt) > now
  ) {
    return {
      processed: false,
      reason: "The scheduled retry time has not arrived."
    };
  }

  const outcome =
    forcedOutcome ||
    (process.env.MOCK_DUNNING_OUTCOME === "success"
      ? "success"
      : "failure");

  if (!["success", "failure"].includes(outcome)) {
    throw new Error("Invalid payment outcome.");
  }

  if (!invoice.firstFailedAt) {
    invoice.firstFailedAt = now;
  }

  const payment = await Payment.create({
    user: invoice.user,
    invoice: invoice._id,
    amountInPaise: invoice.amountInPaise,
    currency: invoice.currency,
    provider: "mock",
    status: outcome === "success" ? "succeeded" : "failed",
    failureReason:
      outcome === "failure"
        ? "Simulated automatic retry failure"
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
      user: invoice.user
    });

    let subscriptionReactivated = false;

    if (subscription && subscription.status === "past_due") {
      subscription.status = "active";
      await subscription.save();
      subscriptionReactivated = true;
    }

    return {
      processed: true,
      outcome: "success",
      invoiceId: invoice._id,
      paymentId: payment._id,
      subscriptionReactivated,
      message: "Payment recovered successfully."
    };
  }

  invoice.retryCount += 1;

  if (invoice.retryCount >= MAX_RETRIES) {
    invoice.dunningStatus = "exhausted";
    invoice.nextRetryAt = null;

    await invoice.save();

    await Subscription.updateOne(
      {
        _id: invoice.subscription,
        user: invoice.user,
        status: { $ne: "canceled" }
      },
      {
        $set: { status: "canceled" }
      }
    );

    return {
      processed: true,
      outcome: "failure",
      invoiceId: invoice._id,
      retryCount: invoice.retryCount,
      subscriptionCanceled: true,
      paymentId: payment._id,
      message: "All retry attempts failed."
    };
  }

  invoice.nextRetryAt = addDays(
    invoice.firstFailedAt,
    RETRY_DAYS[invoice.retryCount]
  );

  await invoice.save();

  return {
    processed: true,
    outcome: "failure",
    invoiceId: invoice._id,
    retryCount: invoice.retryCount,
    nextRetryAt: invoice.nextRetryAt,
    paymentId: payment._id,
    message: "Payment failed. Another retry has been scheduled."
  };
}

async function processDueRetries() {
  const now = new Date();

  const dueInvoices = await Invoice.find({
    status: "past_due",
    dunningStatus: "retrying",
    billingPeriodStart: { $lte: now },
    nextRetryAt: { $lte: now },
    retryCount: { $lt: MAX_RETRIES }
  });

  const results = [];

  for (const invoice of dueInvoices) {
    try {
      results.push(await processInvoiceRetry(invoice));
    } catch (error) {
      console.error(
        `Dunning retry failed for invoice ${invoice._id}:`,
        error.message
      );
    }
  }

  if (results.length > 0) {
    console.log(`Dunning processed ${results.length} retry attempt(s).`);
  }

  return results;
}

module.exports = {
  processDueRetries,
  processInvoiceRetry
};
