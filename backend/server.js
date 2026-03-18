// server.js
const path = require("path");
// Load environment variables from .env in the same directory as server.js
require("dotenv").config({ path: path.join(__dirname, ".env") });

// ── Step 1: Validate environment BEFORE anything else starts ──────────────────
const validateEnv = require("./utils/validateEnv");
validateEnv();

const express = require("express");
const app = express();

const cors = require("cors");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

/* ================= CORS ─ ROBUSTIFIED (MOVED TO TOP) ================= */
// Build allowlist from env var so it's configurable per-environment
const CONST_ALLOWED_ORIGINS = [
  "https://slategray-skunk-723064.hostingersite.com",
  "https://aptiogen-56f98.web.app",
  "https://aptiogen-56f98.firebaseapp.com",
];

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
  "http://10.184.60.26:3000",
];

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : [];

const allowedOrigins = [
  ...CONST_ALLOWED_ORIGINS,
  ...envOrigins,
  ...(process.env.NODE_ENV !== "production" ? DEV_ORIGINS : []),
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      const normalizedOrigin = origin.trim().toLowerCase();
      const isAllowed = allowedOrigins.some(o => o.trim().toLowerCase() === normalizedOrigin);
      if (isAllowed) return callback(null, true);
      console.warn(`[CORS] Request blocked for origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "X-Requested-With", 
      "Accept", 
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers"
    ],
    exposedHeaders: ["Set-Cookie"]
  })
);

// CORS Diagnostic Route
app.get("/api/cors-test", (req, res) => {
  res.json({
    message: "CORS Diagnostic",
    origin: req.headers.origin || "None",
    allowedOrigins,
    nodeEnv: process.env.NODE_ENV
  });
});

// ✅ NEW: Trust the first proxy (Essential for Hostinger/Passenger/Cloudflare)
// This fixes the 'X-Forwarded-For' crash you see in the logs.
app.set('trust proxy', 1);

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const practiceRoutes = require("./routes/practiceRoutes");
const eventRoutes = require("./routes/eventRoutes");
const institutionRoutes = require("./routes/institutionRoutes");
const batchRoutes = require("./routes/batchRoutes");
const { router: superAdminRoutes } = require("./routes/superAdminRoutes");
const superAdminPipeline = require("./routes/superAdminPipeline");
const hodRoutes = require("./routes/hodRoutes");
const studentRoutes = require("./routes/studentRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const publicRoutes = require("./routes/publicRoutes");
const { startCleanupScheduler } = require("./services/cleanupService");
const { globalErrorHandler } = require("./utils/errorHandler");

let server;

/* ================= FIREBASE ================= */
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL &&
    (process.env.FIREBASE_PRIVATE_KEY_BASE64 || process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_B64_1)) {
    // ✅ PRIMARY (Hostinger): individual env vars
    // FIREBASE_PRIVATE_KEY_BASE64 = Base64 of just the private key (safe for Hostinger UI)
    // FIREBASE_PRIVATE_KEY        = raw key with \n (works locally via dotenv)
    let privateKey;
    let b64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    
    // Join split variables if they exist (to bypass tiny Hostinger UI length limits)
    if (!b64) {
      let joined = "";
      for (let i = 1; i <= 10; i++) {
        const part = process.env[`FIREBASE_PRIVATE_KEY_B64_${i}`];
        if (part) joined += part;
        else break;
      }
      if (joined) b64 = joined;
    }

    if (b64) {
      privateKey = Buffer.from(b64, 'base64').toString('utf8');
    } else if (process.env.FIREBASE_PRIVATE_KEY) {
      privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      universe_domain: "googleapis.com",
    };
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin initialized from individual environment variables");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    // Fallback: entire service account JSON as Base64
    const jsonString = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(jsonString);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin initialized from Base64 environment variable");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Fallback: raw JSON string
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin initialized from JSON environment variable");
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && process.env.NODE_ENV !== 'production') {
    // Local dev only: load from file
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase Admin initialized from file (dev mode)");
  } else {
    console.warn("⚠️ No Firebase credentials configured. Auth features may fail.");
    console.log(`[DEBUG] FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID ? "PRESENT" : "MISSING"}`);
    console.log(`[DEBUG] FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL ? "PRESENT" : "MISSING"}`);
    console.log(`[DEBUG] FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? "PRESENT" : "MISSING"}`);
    console.log(`[DEBUG] FIREBASE_PRIVATE_KEY_B64_1: ${process.env.FIREBASE_PRIVATE_KEY_B64_1 ? "PRESENT" : "MISSING"}`);
    console.log(`[DEBUG] FIREBASE_PRIVATE_KEY_B64_2: ${process.env.FIREBASE_PRIVATE_KEY_B64_2 ? "PRESENT" : "MISSING"}`);
    console.log(`[DEBUG] FIREBASE_PRIVATE_KEY_B64_3: ${process.env.FIREBASE_PRIVATE_KEY_B64_3 ? "PRESENT" : "MISSING"}`);
    console.log(`[DEBUG] FIREBASE_PRIVATE_KEY_B64_4: ${process.env.FIREBASE_PRIVATE_KEY_B64_4 ? "PRESENT" : "MISSING"}`);
  }
} catch (error) {
  console.error("⚠️ Firebase Admin initialization error:", error.message);
}


/* ================= SECURITY HEADERS (helmet) ================= */
app.use(
  helmet({
    // Allow Firebase CDN scripts in the browser (needed for frontend firebase SDK)
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://www.gstatic.com",
          "https://apis.google.com",
        ],
        connectSrc: [
          "'self'",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "wss://*.firebaseio.com",
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    // Enforce HTTPS in production
    hsts: process.env.NODE_ENV === "production"
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  })
);

/* ================= RATE LIMITING ================= */
// General API limiter — tightened from 1000 to 200 per 15 min
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

// Auth endpoints — strict: 10 failed attempts per 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many login attempts. Please wait 15 minutes." },
});

// Super admin — extra strict: 20 requests per 15 min (it's a single user)
const superAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many super admin requests." },
});

/* CORS block moved to top */


/* ================= RATE LIMIT APPLICATION ================= */
app.use("/api", limiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/institution/login", authLimiter);
app.use("/api/auth/student/login", authLimiter);
app.use("/api/events/student-login", authLimiter);
app.use("/api/super-admin", superAdminLimiter); // Extra protection on admin routes

/* ================= BODY PARSING & SANITIZATION ================= */
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(mongoSanitize()); // Strips $ and . from req.body to prevent NoSQL injection
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/super-admin", superAdminPipeline);
app.use("/api/hod", hodRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/public", publicRoutes);

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send(`
    <style>
      body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
      .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; }
      h1 { color: #3b82f6; margin-bottom: 0.5rem; }
      p { color: #64748b; line-height: 1.5; }
      .status { display: inline-block; padding: 0.25rem 0.75rem; background: #dcfce7; color: #166534; border-radius: 9999px; font-weight: 600; font-size: 0.875rem; margin-top: 1rem; }
    </style>
    <div class="card">
      <h1>AptioGen API</h1>
      <p>The backend server is running and healthy on Hostinger.</p>
      <div class="status">● ACTIVE</div>
    </div>
  `);
});

/* ================= HEALTH ================= */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* ================= 404 ================= */
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

/* ================= GLOBAL ERROR HANDLER (must be last) ================= */
// Replaces the old inline handler. Reads NODE_ENV to decide verbosity.
app.use(globalErrorHandler);

/* ================= SERVER START ================= */
const PORT = process.env.PORT || 5000;

async function startServer() {
  if (server) return;

  try {
    // Debug info for Hostinger troubleshooting
    const envPath = require("path").join(__dirname, ".env");
    console.log(`[DEBUG] __dirname: ${__dirname}`);
    console.log(`[DEBUG] process.cwd(): ${process.cwd()}`);
    console.log(`[DEBUG] Attempting to load .env from: ${envPath}`);

    await connectDB();
    startCleanupScheduler();

    // On Hostinger, 'Passenger' usually handles the port and intercepts .listen()
    // We call it simply; Passenger will handle the rest.
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Mode: ${process.env.NODE_ENV || "development"}`);
    });

  } catch (err) {
    console.error("❌ Critical Startup Error:", err);
  }
}


if (process.env.NODE_ENV !== "test") {
  startServer();
}



/* ================= GRACEFUL SHUTDOWN ================= */
function gracefulShutdown() {
  console.log("\n🛑 Shutting down gracefully...");

  if (!server) return process.exit(0);

  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    } catch (err) {
      console.error("❌ Error during MongoDB shutdown:", err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("⚠️ Force shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

module.exports = app;