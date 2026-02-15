//institutionRoutes.js
const express = require("express");
const router = express.Router();
const Institution = require("../models/Institution");
const Department = require("../models/Department");
const { verifyToken } = require("./authRoutes");

// Create new institution (Onboarding)
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, type, email, phone, location, academicConfig } = req.body;

        // Check if institution already registered by this admin
        let inst = await Institution.findOne({ adminUID: req.user.uid });
        if (inst) {
            return res.status(400).json({ error: "You have already registered an institution" });
        }

        inst = await Institution.create({
            name,
            type,
            adminUID: req.user.uid,
            email: email || req.user.email,
            phone,
            location,
            subscription: { plan: "free", status: "active" }, // Default to free
            academicConfig
        });

        res.status(201).json({ message: "Institution registered successfully", institution: inst });
    } catch (error) {
        console.error("Institution registration error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get institution details
router.get("/my", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) {
            return res.status(404).json({ error: "Institution not found" });
        }
        res.json(inst);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manage Departments
router.post("/departments", verifyToken, async (req, res) => {
    try {
        const { name, code } = req.body;
        const inst = await Institution.findOne({ adminUID: req.user.uid });

        if (!inst) return res.status(404).json({ error: "Institution not found" });

        const dept = await Department.create({
            name,
            code,
            institutionId: inst._id
        });

        res.status(201).json(dept);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/departments", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) return res.status(404).json({ error: "Institution not found" });

        const depts = await Department.find({ institutionId: inst._id });
        res.json(depts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
