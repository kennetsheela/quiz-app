//publicRoutes.js
const express = require("express");
const router = express.Router();
const Institution = require("../models/Institution");
const Department = require("../models/Department");
const Batch = require("../models/Batch");
const PlatformSettings = require("../models/PlatformSettings");

// GET /api/public/institutions - List institutions for registration
router.get("/institutions", async (req, res) => {
    try {
        const institutions = await Institution.find({ "subscription.status": "active" }, "name _id type");
        res.json(institutions);
    } catch (error) {
        console.error("Public institution fetch error:", error);
        res.status(500).json({ error: "Failed to fetch institutions." });
    }
});

// GET /api/public/institutions/:id/departments - List departments for an institution
router.get("/institutions/:id/departments", async (req, res) => {
    try {
        const depts = await Department.find({ institutionId: req.params.id }, "name code _id");
        res.json(depts || []);
    } catch (error) {
        console.error("Public department fetch error:", error);
        res.status(500).json({ error: "Failed to fetch departments." });
    }
});

// GET /api/public/institutions/:id/batches - List batches for an institution (Global)
router.get("/institutions/:id/batches", async (req, res) => {
    try {
        const instId = req.params.id;

        // Validate Institution ID
        if (!/^[0-9a-fA-F]{24}$/.test(instId)) {
            return res.status(400).json({ error: "Invalid Institution ID" });
        }

        // Return ALL active batches for the institution, regardless of department
        const filter = { institutionId: instId, status: "active" };

        const batches = await Batch.find(filter, "batchID startYear endYear _id name currentYearLevel graduationDate")
            .sort({ startYear: -1 });

        res.json(batches || []);
    } catch (error) {
        console.error("Public batch fetch error:", error);
        res.status(500).json({ error: "Failed to fetch batches. Please try again later." });
    }
});

// GET /api/public/settings/:key - Get public settings like Terms & Conditions
router.get("/settings/:key", async (req, res) => {
    try {
        const setting = await PlatformSettings.findOne({ key: req.params.key });
        if (!setting) return res.json({ value: "" });
        res.json({ value: setting.value });
    } catch (error) {
        console.error("Public settings fetch error:", error);
        res.status(500).json({ error: "Failed to fetch settings." });
    }
});

module.exports = router;
