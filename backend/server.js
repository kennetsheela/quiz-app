//server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const practiceRoutes = require("./routes/practiceRoutes");
const eventRoutes = require("./routes/eventRoutes");
<<<<<<< HEAD
const institutionRoutes = require("./routes/institutionRoutes");
const batchRoutes = require("./routes/batchRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");
=======
const analyticsRoutes = require("./routes/analyticsRoutes");
>>>>>>> 34ac94f46eaab833062398555294a211f6adb2bc
const { startCleanupScheduler } = require("./services/cleanupService");

/* ================= APP ================= */
const app = express();
let server; // ✅ single shared server instance

/* ================= FIREBASE ================= */
try {
  // Check if FIREBASE_SERVICE_ACCOUNT env variable exists (for production)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized from environment variable");
  } else {
    // Use file for local development
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./serviceAccountKey.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized from file");
  }
} catch (error) {
  console.error("⚠️ Firebase Admin initialization skipped:", error.message);
}

/* ================= SECURITY ================= */
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

app.use("/api", limiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/events/student-login", authLimiter);
app.use("/api/analytics", analyticsRoutes);
/* ================= CORS ================= */
app.use(cors({
  origin: [
    'http://localhost:5000',
    'https://quiz-app-3e991.web.app',
    'https://quiz-app-3e991.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5500',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

/* ================= MIDDLEWARE ================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(mongoSanitize());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/super-admin", superAdminRoutes);

/* ================= HEALTH ================= */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* ================= ERRORS ================= */
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message
  });
});

/* ================= 404 ================= */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

/* ================= SERVER START (FIXED) ================= */
const PORT = process.env.PORT || 5000;

async function startServer() {
  if (server) return; // ✅ prevents double start

  try {
    await connectDB();

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🌐 API Base URL: http://localhost:${PORT}`);

      startCleanupScheduler(); // ✅ preserved
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

/* ================= GRACEFUL SHUTDOWN ================= */
function gracefulShutdown() {
  console.log("\n🛑 Shutting down gracefully...");

  if (!server) return process.exit(0);

  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error("⚠️ Force shutdown");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

module.exports = app;