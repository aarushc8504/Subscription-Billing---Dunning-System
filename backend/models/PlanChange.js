
const mongoose = require("mongoose");

const planChangeSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        subscription: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subscription",
            required: true,
            index: true
        },
        oldPlanName: {
            type: String,
            required: true
        },
        newPlanName: {
            type: String,
            required: true
        },
        oldPriceInPaise: {
            type: Number,
            required: true,
            min: 0
        },
        newPriceInPaise: {
            type: Number,
            required: true,
            min: 0
        },
        changeType: {
            type: String,
            enum: ["upgrade", "downgrade", "unchanged"],
            required: true
        },
        adjustmentType: {
            type: String,
            enum: ["charge", "credit", "none"],
            required: true
        },
        adjustmentInPaise: {
            type: Number,
            required: true,
            min: 0
        },
        prorationInvoice: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Invoice",
            default: null
        },
        remainingFraction: {
            type: Number,
            required: true,
            min: 0,
            max: 1
        },
        periodStart: {
            type: Date,
            required: true
        },
        periodEnd: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: true
    }
);

planChangeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("PlanChange", planChangeSchema);
