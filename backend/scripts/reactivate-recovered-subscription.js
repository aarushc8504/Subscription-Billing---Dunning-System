const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env")
});

const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Subscription = require("../models/Subscription");

const SUBSCRIPTION_ID = "6adf1187144d12f0133ab319";
const INVOICE_ID = "6adf6755fa00825c2c53ef03";

async function main() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const invoice = await Invoice.findOne({
      _id: INVOICE_ID,
      subscription: SUBSCRIPTION_ID,
      status: "paid",
      dunningStatus: "recovered"
    });

    if (!invoice) {
      console.log(
        "Safety check failed: matching paid and recovered invoice not found."
      );
      return;
    }

    const subscription = await Subscription.findById(
      SUBSCRIPTION_ID
    );

    if (!subscription) {
      console.log("Subscription not found.");
      return;
    }

    if (subscription.status === "canceled") {
      console.log(
        "Subscription is canceled. It will not be reactivated automatically."
      );
      return;
    }

    if (subscription.status !== "past_due") {
      console.log(
        `No change needed. Current subscription status: ${subscription.status}`
      );
      return;
    }

    subscription.status = "active";
    await subscription.save();

    console.log("Subscription successfully reactivated.");
    console.log({
      name: subscription.name,
      planName: subscription.planName,
      status: subscription.status,
      invoiceId: invoice._id.toString(),
      invoiceStatus: invoice.status,
      dunningStatus: invoice.dunningStatus
    });
  } catch (error) {
    console.error("Reactivation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
