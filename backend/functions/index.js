const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Import routes
const authRoutes = require("../routes/auth");
const questionRoutes = require("../routes/questions");
// Import other routes as needed

// Use routes
app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
// Add other routes

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Quiz App API is running" });
});

// Export the API as a Cloud Function
exports.api = functions.https.onRequest(app);