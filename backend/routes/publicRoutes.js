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
        res.status(500).json({ error: error.message });
    }
});

// GET /api/public/institutions/:id/departments - List departments for an institution
router.get("/institutions/:id/departments", async (req, res) => {
    try {
        const depts = await Department.find({ institutionId: req.params.id }, "name code _id");
        res.json(depts || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/public/departments/:id/batches - List batches for a department (id is instId and code/deptId is in query)
router.get("/institutions/:id/batches", async (req, res) => {
    try {
        const { deptCode, deptId } = req.query;
        const filter = { institutionId: req.params.id, status: "active" };

        if (deptId) {
            // Find the department to get its code, so we can search by both
            const dept = await Department.findById(deptId);
            if (dept) {
                filter.departmentId = { $in: [deptId, dept.code] };
            } else {
                filter.departmentId = deptId;
            }
        } else if (deptCode) {
            // If only code is provided, try to find the department ID first
            const dept = await Department.findOne({ institutionId: req.params.id, code: deptCode });
            if (dept) {
                filter.departmentId = { $in: [dept._id, deptCode] };
            } else {
                filter.departmentId = deptCode;
            }
        }

        const batches = await Batch.find(filter, "batchID startYear endYear _id name");
        res.json(batches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/public/settings/:key - Get public settings like Terms & Conditions
router.get("/settings/:key", async (req, res) => {
    try {
        const setting = await PlatformSettings.findOne({ key: req.params.key });
        if (!setting) return res.json({ value: "" });
        res.json({ value: setting.value });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
