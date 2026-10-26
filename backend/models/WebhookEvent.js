
const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  provider: {
    type: String,
    default: "mock",
    enum: ["mock"]
  },
  type: {
    type: String,
    required: true,
    enum: ["payment.succeeded", "payment.failed"]
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    required: true
  },
  status: {
    type: String,
    enum: ["processing", "processed", "failed"],
    default: "processing"
  },
  resultMessage: {
    type: String,
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

webhookEventSchema.index(
  { eventId: 1 },
  { unique: true, name: "unique_webhook_event_id" }
);

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
