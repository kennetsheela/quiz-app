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

        if (!institutionId) return res.status(404).json({ error: "Institution ID not found in token" });

        const batch = await Batch.create({
            batchID,
            institutionId,
            startYear,
            endYear,
            currentYearLevel: currentYearLevel || 1
        });

        res.status(201).json(batch);
    } catch (error) {
        console.error("Create batch error:", error);
        res.status(500).json({ error: "Failed to create batch." });
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
        console.error("Get batches error:", error);
        res.status(500).json({ error: "Failed to fetch batches." });
    }
});

// GET /api/batches/:instId/active - Get active batches for an institution (Used by HOD Dashboard)
router.get("/:instId/active", authenticate, async (req, res) => {
    try {
        const { instId } = req.params;
        // Verify user belongs to this institution
        if (req.user.institutionId?.toString() !== instId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }
        const batches = await Batch.find({ institutionId: instId, status: { $ne: 'archived' } });
        res.json({ batches });
    } catch (error) {
        console.error("Get active batches error:", error);
        res.status(500).json({ error: "Failed to fetch active batches." });
    }
});

module.exports = router;
