const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env")
});

const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const Invoice = require("../models/Invoice");

const USER_ID = "6adedc2e3f672655fb393053";
const SUBSCRIPTION_ID = "6adf1187144d12f0133ab319";
const INVOICE_ID = "6adf6755fa00825c2c53ef03";

async function main() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing.");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const invoice = await Invoice.findOne({
      _id: INVOICE_ID,
      user: USER_ID,
      subscription: SUBSCRIPTION_ID,
      status: "paid",
      dunningStatus: "recovered"
    });

    if (!invoice) {
      throw new Error("The expected paid, recovered invoice was not found.");
    }

    const subscription = await Subscription.findOne({
      _id: SUBSCRIPTION_ID,
      user: USER_ID
    });

    if (!subscription) {
      throw new Error("YouTube Premium subscription not found.");
    }

    if (subscription.status !== "active") {
      throw new Error(
        `Expected active subscription; found ${subscription.status}.`
      );
    }

    if (
      subscription.currentPeriodStart ||
      subscription.nextBillingDate
    ) {
      throw new Error(
        "Billing dates already exist. No changes were made."
      );
    }

    const periodStart = new Date(invoice.paidAt);
    const nextBillingDate = new Date(periodStart);
    nextBillingDate.setDate(nextBillingDate.getDate() + 30);

    subscription.currentPeriodStart = periodStart;
    subscription.nextBillingDate = nextBillingDate;

    await subscription.save();

    console.log("YouTube Premium billing dates repaired.");
    console.log({
      name: subscription.name,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      nextBillingDate: subscription.nextBillingDate
    });
  } catch (error) {
    console.error("Repair failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
