
const dns = require("node:dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
    path: require("path").join(__dirname, "..", ".env")
});

const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");

async function checkSubscriptions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const subscriptions = await Subscription.find({}).select(
            "name planName status currentPeriodStart nextBillingDate"
        );

        console.log("\n--- SUBSCRIPTION BILLING DATE CHECK ---");

        for (const sub of subscriptions) {
            console.log({
                name: sub.name,
                plan: sub.planName,
                status: sub.status,
                currentPeriodStart: sub.currentPeriodStart,
                nextBillingDate: sub.nextBillingDate
            });
        }

        console.log(`\nTotal subscriptions: ${subscriptions.length}`);
    } catch (error) {
        console.error("Diagnostic failed:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

checkSubscriptions();
