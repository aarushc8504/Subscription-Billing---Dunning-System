const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env")
});

const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");
const PlanChange = require("../models/PlanChange");

const USER_ID = "6adedc2e3f672655fb393053";
const SUBSCRIPTION_IDS = [
  "6adf1187144d12f0133ab31b",
  "6adf1187144d12f0133ab319"
];

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    for (const subscriptionId of SUBSCRIPTION_IDS) {
      const subscription = await Subscription.findOne({
        _id: subscriptionId,
        user: USER_ID
      }).lean();

      if (!subscription) {
        console.log(`Subscription not found: ${subscriptionId}`);
        continue;
      }

      const invoices = await Invoice.find({
        subscription: subscriptionId,
        user: USER_ID
      }).sort({ billingPeriodStart: 1 }).lean();

      const invoiceIds = invoices.map(invoice => invoice._id);

      const payments = await Payment.find({
        user: USER_ID,
        invoice: { $in: invoiceIds }
      }).sort({ createdAt: 1 }).lean();

      const planChanges = await PlanChange.find({
        subscription: subscriptionId,
        user: USER_ID
      }).sort({ createdAt: 1 }).lean();

      console.log("\n================================");
      console.log("SUBSCRIPTION AUDIT");
      console.log("================================");

      console.log(JSON.stringify({
        subscription: {
          id: subscription._id,
          name: subscription.name,
          planName: subscription.planName,
          priceInPaise: subscription.priceInPaise,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          nextBillingDate: subscription.nextBillingDate
        },
        invoices: invoices.map(invoice => ({
          id: invoice._id,
          description: invoice.description,
          amountInPaise: invoice.amountInPaise,
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
        payments: payments.map(payment => ({
          id: payment._id,
          invoice: payment.invoice,
          amountInPaise: payment.amountInPaise,
          status: payment.status,
          provider: payment.provider,
          paidAt: payment.paidAt,
          createdAt: payment.createdAt
        })),
        planChanges: planChanges.map(change => ({
          id: change._id,
          oldPlanName: change.oldPlanName,
          newPlanName: change.newPlanName,
          oldPriceInPaise: change.oldPriceInPaise,
          newPriceInPaise: change.newPriceInPaise,
          adjustmentType: change.adjustmentType,
          adjustmentInPaise: change.adjustmentInPaise,
          periodStart: change.periodStart,
          periodEnd: change.periodEnd,
          createdAt: change.createdAt
        }))
      }, null, 2));
    }
  } catch (error) {
    console.error("Audit failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
