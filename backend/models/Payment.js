
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Payment amount must be a safe integer in paise."
      }
    },
    currency: {
      type: String,
      default: "INR",
      enum: ["INR"]
    },
    provider: {
      type: String,
      default: "mock",
      enum: ["mock"]
    },
    status: {
      type: String,
      required: true,
      enum: ["succeeded", "failed"]
    },
    failureReason: {
      type: String,
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

paymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
