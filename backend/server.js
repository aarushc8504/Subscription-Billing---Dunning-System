const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config({
  path: require("path").join(__dirname, ".env")
});

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cron = require("node-cron");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const subscriptionRoutes = require("./routes/subscriptions");
const invoiceRoutes = require("./routes/invoices");
const paymentRoutes = require("./routes/payments");
const dunningRoutes = require("./routes/dunning");
const webhookRoutes = require("./routes/webhooks");
const { processDueRetries } = require("./services/dunning");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ message: "Ledger Billing API is running." });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dunning", dunningRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "API route not found." });
});

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from backend/.env");
    }

    if (!process.env.MOCK_WEBHOOK_SECRET) {
      throw new Error("MOCK_WEBHOOK_SECRET is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected successfully.");

    cron.schedule("* * * * *", async () => {
      try {
        await processDueRetries();
      } catch (error) {
        console.error("Dunning scheduler error:", error.message);
      }
    });

    console.log(
      "Dunning scheduler enabled: checking due retries every minute."
    );

    app.listen(PORT, () => {
      console.log(`Ledger API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
