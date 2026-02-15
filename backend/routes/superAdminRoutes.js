//superAdminRoutes.js
const express = require("express");
const router = express.Router();
const Institution = require("../models/Institution");
const User = require("../models/User");
const Event = require("../models/Event");
const { verifyToken } = require("./authRoutes");

// Middleware to verify Super Admin role
const verifySuperAdmin = async (req, res, next) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user || user.role !== "super-admin") {
            return res.status(403).json({ error: "Access denied. Super Admin role required." });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Global Stats
router.get("/stats", verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const totalInst = await Institution.countDocuments();
        const totalStudents = await User.countDocuments({ role: "student" });
        const totalEvents = await Event.countDocuments();

        res.json({
            institutions: totalInst,
            students: totalStudents,
            events: totalEvents,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all institutions
router.get("/institutions", verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const institutions = await Institution.find().sort({ createdAt: -1 });
        res.json(institutions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
