
const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subscription",
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  amountInPaise: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isSafeInteger,
      message: "Invoice amount must be a safe integer in paise."
    }
  },
  currency: {
    type: String,
    default: "INR",
    enum: ["INR"]
  },
  billingPeriodStart: {
    type: Date,
    required: true
  },
  billingPeriodEnd: {
    type: Date,
    required: true,
    validate: {
      validator: function (value) {
        return value > this.billingPeriodStart;
      },
      message: "Billing period end must be after its start."
    }
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ["open", "paid", "past_due", "void"],
    default: "open"
  },
  paidAt: {
    type: Date,
    default: null
  },

  firstFailedAt: {
    type: Date,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 4
  },
  nextRetryAt: {
    type: Date,
    default: null
  },
  dunningStatus: {
    type: String,
    enum: ["not_started", "retrying", "recovered", "exhausted"],
    default: "not_started"
  }
}, { timestamps: true });

invoiceSchema.index(
  {
    subscription: 1,
    billingPeriodStart: 1,
    billingPeriodEnd: 1
  },
  {
    unique: true,
    name: "unique_subscription_billing_period"
  }
);

invoiceSchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
