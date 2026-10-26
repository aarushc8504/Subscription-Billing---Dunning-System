
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        planName: {
            type: String,
            required: true,
            trim: true
        },
        priceInPaise: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: Number.isSafeInteger,
                message: "Price must be an integer in paise."
            }
        },
        color: {
            type: String,
            default: "#3FA66E"
        },
        icon: {
            type: String,
            default: "credit-card"
        },
        status: {
            type: String,
            enum: ["trialing", "active", "past_due", "canceled"],
            default: "active",
            required: true
        },
        currentPeriodStart: {
            type: Date,
            default: null
        },
        nextBillingDate: {
            type: Date,
            default: null
        },
        billingHistory: {
            type: [{
                status: {
                    type: String,
                    enum: ["paid", "retrying", "failed"]
                },
                date: Date,
                amountInPaise: {
                    type: Number,
                    min: 0,
                    validate: Number.isSafeInteger
                }
            }],
            default: []
        }
    },
    {
        timestamps: true
    }
);

subscriptionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Subscription", subscriptionSchema);
