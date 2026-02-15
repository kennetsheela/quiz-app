//hodRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("./authRoutes");
const User = require("../models/User");
const Department = require("../models/Department");
const Event = require("../models/Event");
const StudentProfile = require("../models/StudentProfile");
const Analytics = require("../models/Analytics");

// Middleware to verify HOD role
const verifyHOD = async (req, res, next) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user || user.role !== "hod") {
            return res.status(403).json({ error: "Access denied. HOD role required." });
        }
        req.hodUser = user;
        next();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/hod/dashboard - Department-scoped dashboard
router.get("/dashboard", verifyToken, verifyHOD, async (req, res) => {
    try {
        const department = await Department.findById(req.hodUser.hodDepartmentId);

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const totalStudents = await User.countDocuments({
            institutionId: req.hodUser.institutionId,
            department: department.code,
            role: "student"
        });

        const totalEvents = await Event.countDocuments({
            institutionId: req.hodUser.institutionId,
            targetDepartments: department.code
        });

        res.json({
            department,
            stats: {
                totalStudents,
                totalEvents
            }
        });
    } catch (error) {
        console.error("HOD dashboard error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/hod/students - Department students only
router.get("/students", verifyToken, verifyHOD, async (req, res) => {
    try {
        const department = await Department.findById(req.hodUser.hodDepartmentId);

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const students = await User.find({
            institutionId: req.hodUser.institutionId,
            department: department.code,
            role: "student"
        }).select("-password");

        res.json({ students });
    } catch (error) {
        console.error("Get students error:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/hod/events - Create department events
router.post("/events", verifyToken, verifyHOD, async (req, res) => {
    try {
        const department = await Department.findById(req.hodUser.hodDepartmentId);

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        // Check permission
        if (!req.hodUser.hodPermissions.createDepartmentEvents) {
            return res.status(403).json({ error: "You don't have permission to create events" });
        }

        const eventData = {
            ...req.body,
            institutionId: req.hodUser.institutionId,
            targetDepartments: [department.code],
            visibility: "department",
            createdBy: req.user.uid,
            createdByRole: "hod"
        };

        const event = new Event(eventData);
        await event.save();

        res.status(201).json({ message: "Event created successfully", event });
    } catch (error) {
        console.error("Create event error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/hod/analytics - Department analytics
router.get("/analytics", verifyToken, verifyHOD, async (req, res) => {
    try {
        const department = await Department.findById(req.hodUser.hodDepartmentId);

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const analytics = await Analytics.findOne({
            type: "department",
            departmentId: department._id,
            period: "all-time"
        });

        res.json({ analytics: analytics || {} });
    } catch (error) {
        console.error("Analytics error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
