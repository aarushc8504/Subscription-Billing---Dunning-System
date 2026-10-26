
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("node:path").join(__dirname, "..", ".env")
});

const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const Invoice = require("../models/Invoice");

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const subscription = await Subscription.findOne({
      name: "YouTube Premium",
      planName: "Individual",
      status: "past_due"
    });

    if (!subscription) {
      throw new Error("YouTube Premium subscription was not found.");
    }

    const existingInvoice = await Invoice.findOne({
      user: subscription.user,
      subscription: subscription._id,
      billingPeriodStart: new Date("2026-09-23T00:00:00.000Z"),
      billingPeriodEnd: new Date("2026-10-23T00:00:00.000Z")
    });

    if (existingInvoice) {
      console.log("This demo invoice already exists.");
      console.log("Invoice ID:", existingInvoice._id.toString());
      console.log("Status:", existingInvoice.status);
      return;
    }

    const invoice = await Invoice.create({
      user: subscription.user,
      subscription: subscription._id,
      description: "YouTube Premium Individual — Demo overdue invoice",
      amountInPaise: subscription.priceInPaise,
      currency: "INR",
      billingPeriodStart: new Date("2026-09-23T00:00:00.000Z"),
      billingPeriodEnd: new Date("2026-10-23T00:00:00.000Z"),
      dueDate: new Date("2026-10-23T00:00:00.000Z"),
      status: "open",
      paidAt: null,
      firstFailedAt: null,
      retryCount: 0,
      nextRetryAt: null,
      dunningStatus: "not_started"
    });

    console.log("\nDemo invoice created successfully.");
    console.log({
      invoiceId: invoice._id.toString(),
      subscription: subscription.name,
      amount: "₹149.00",
      billingPeriodStart: invoice.billingPeriodStart,
      billingPeriodEnd: invoice.billingPeriodEnd,
      dueDate: invoice.dueDate,
      status: invoice.status,
      dunningStatus: invoice.dunningStatus
    });

    console.log(
      "\nNext: simulate a failed payment through the existing payments API."
    );
  } catch (error) {
    console.error("Invoice setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
