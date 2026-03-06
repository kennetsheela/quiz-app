//batchRoutes.js
const express = require("express");
const router = express.Router();
const Batch = require("../models/Batch");
const Institution = require("../models/Institution");
const { authenticate } = require("../middleware/authMiddleware");

// Create a new batch
router.post("/", authenticate, async (req, res) => {
    try {
        const { batchID, startYear, endYear, currentYearLevel } = req.body;
        const institutionId = req.user.institutionId;

        if (!institutionId) return res.status(404).json({ error: "Only institutional admins can create batches" });

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
router.get("/", authenticate, async (req, res) => {
    try {
        const institutionId = req.user.institutionId;
        if (!institutionId) return res.status(404).json({ error: "Institution not found" });

        const batches = await Batch.find({ institutionId });
        res.json(batches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
