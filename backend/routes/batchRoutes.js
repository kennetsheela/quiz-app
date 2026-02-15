//batchRoutes.js
const express = require("express");
const router = express.Router();
const Batch = require("../models/Batch");
const Institution = require("../models/Institution");
const { verifyToken } = require("./authRoutes");

// Create a new batch
router.post("/", verifyToken, async (req, res) => {
    try {
        const { batchID, startYear, endYear, currentYearLevel } = req.body;
        const inst = await Institution.findOne({ adminUID: req.user.uid });

        if (!inst) return res.status(404).json({ error: "Only institutional admins can create batches" });

        const batch = await Batch.create({
            batchID,
            institutionId: inst._id,
            startYear,
            endYear,
            currentYearLevel: currentYearLevel || 1
        });

        res.status(201).json(batch);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all batches for the logged-in institution
router.get("/", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) return res.status(404).json({ error: "Institution not found" });

        const batches = await Batch.find({ institutionId: inst._id });
        res.json(batches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
