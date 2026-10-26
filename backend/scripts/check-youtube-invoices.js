
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env")
});

const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const Invoice = require("../models/Invoice");

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const subscription = await Subscription.findOne({
      name: "YouTube Premium"
    }).lean();

    if (!subscription) {
      console.log("YouTube Premium subscription not found.");
      return;
    }

    console.log("\n--- YOUTUBE PREMIUM SUBSCRIPTION ---");
    console.log({
      id: String(subscription._id),
      name: subscription.name,
      planName: subscription.planName,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      nextBillingDate: subscription.nextBillingDate,
      priceInPaise: subscription.priceInPaise,
      price: subscription.price
    });

    const invoices = await Invoice.find({
      subscription: subscription._id
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log("\n--- YOUTUBE PREMIUM INVOICES ---");
    console.log("Invoice count:", invoices.length);

    for (const invoice of invoices) {
      console.log({
        id: String(invoice._id),
        description: invoice.description,
        amountInPaise: invoice.amountInPaise,
        status: invoice.status,
        billingPeriodStart: invoice.billingPeriodStart,
        billingPeriodEnd: invoice.billingPeriodEnd,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        firstFailedAt: invoice.firstFailedAt,
        retryCount: invoice.retryCount,
        nextRetryAt: invoice.nextRetryAt,
        dunningStatus: invoice.dunningStatus,
        createdAt: invoice.createdAt
      });
    }
  } catch (error) {
    console.error("Diagnostic failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
