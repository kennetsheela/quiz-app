//superAdminRoutes.js
const express = require("express");
const router = express.Router();
const QuestionBank = require("../models/QuestionBank");
const Institution = require("../models/Institution");
const User = require("../models/User");
const Event = require("../models/Event");
const Analytics = require("../models/Analytics");
const PlatformSettings = require("../models/PlatformSettings");
const multer = require("multer");
const questionPipelineService = require("../services/questionPipelineService");
const pipelineService = require("../services/pipelineService");


// Multer configuration for memory storage (file buffers)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware to verify Super Admin (hardcoded credentials)
const verifySuperAdmin = (req, res, next) => {
    const { username, password } = req.body;

    // Check against environment variables or hardcoded values
    const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || "superadmin";
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "admin@2026";

    if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized: Invalid super admin credentials" });
    }
};

// ============================================================================
// AUTHENTICATION
// ============================================================================

// POST /api/super-admin/login
router.post("/login", (req, res) => {
    const { username, password } = req.body;

    const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || "superadmin";
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "admin@2026";

    if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
        res.json({
            success: true,
            message: "Login successful",
            user: { username, role: "super-admin" }
        });
    } else {
        res.status(401).json({ error: "Invalid credentials" });
    }
});

// ============================================================================
// DASHBOARD
// ============================================================================

// GET /api/super-admin/dashboard
router.get("/dashboard", async (req, res) => {
    try {
        const totalInstitutions = await Institution.countDocuments();
        const totalStudents = await User.countDocuments({ role: { $in: ["student", "independent"] } });
        const totalQuestions = await QuestionBank.countDocuments();
        const totalEvents = await Event.countDocuments();

        const activeInstitutions = await Institution.countDocuments({ "subscription.status": "active" });
        const suspendedInstitutions = await Institution.countDocuments({ "subscription.status": "suspended" });

        res.json({
            overview: {
                totalInstitutions,
                activeInstitutions,
                suspendedInstitutions,
                totalStudents,
                totalQuestions,
                totalEvents
            }
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// QUESTION BANK MANAGEMENT
// ============================================================================

// POST /api/super-admin/questions - Add single question
router.post("/questions", async (req, res) => {
    try {
        const { category, topic, level, question, options, correctAnswer, explanation, tags, createdBy } = req.body;

        const newQuestion = new QuestionBank({
            category,
            topic,
            level,
            question,
            options,
            correctAnswer,
            explanation,
            tags: tags || [],
            createdBy: createdBy || "super-admin"
        });

        await newQuestion.save();
        res.status(201).json({ message: "Question added successfully", question: newQuestion });
    } catch (error) {
        console.error("Add question error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/super-admin/questions - List/filter questions
router.get("/questions", async (req, res) => {
    try {
        const { category, topic, level, search, page = 1, limit = 10 } = req.query;

        const filter = {};
        if (category) filter.category = category;
        if (topic) filter.topic = topic;
        if (level) filter.level = level;
        if (search) filter.question = { $regex: search, $options: 'i' };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const questions = await QuestionBank.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await QuestionBank.countDocuments(filter);

        res.json({
            questions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get questions error:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/super-admin/questions/:id - Edit question
router.put("/questions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const question = await QuestionBank.findByIdAndUpdate(id, updates, { new: true });

        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        res.json({ message: "Question updated successfully", question });
    } catch (error) {
        console.error("Update question error:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/super-admin/questions/:id - Delete question
router.delete("/questions/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const question = await QuestionBank.findByIdAndDelete(id);

        if (!question) {
            return res.status(404).json({ error: "Question not found" });
        }

        res.json({ message: "Question deleted successfully" });
    } catch (error) {
        console.error("Delete question error:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/super-admin/questions/upload - Bulk upload questions via file (PDF/DOCX)
router.post("/questions/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        let questions = [];
        const buffer = req.file.buffer;
        const mimetype = req.file.mimetype;

        if (mimetype === "application/pdf") {
            questions = await questionPipelineService.parsePdf(buffer);
        } else if (
            mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mimetype === "application/msword"
        ) {
            questions = await questionPipelineService.parseDocx(buffer);
        } else {
            return res.status(400).json({ error: "Unsupported file format. Please upload PDF or DOCX." });
        }

        res.json({
            success: true,
            count: questions.length,
            questions: questions.map((q, idx) => ({ ...q, tempId: idx }))
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Failed to process question file" });
    }
});

// POST /api/super-admin/questions/pipeline - Process file through the full sequential pipeline
router.post("/questions/pipeline", upload.single("file"), async (req, res) => {
    try {
        const { category, creatorId } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!category) {
            return res.status(400).json({ error: "Category is required" });
        }

        const result = await pipelineService.runFullPipeline(
            req.file,
            category,
            creatorId || "super-admin"
        );

        res.json(result);
    } catch (error) {
        console.error("Pipeline error:", error);
        res.status(500).json({ error: error.message || "Failed to process pipeline" });
    }
});


// POST /api/super-admin/questions/bulk - Bulk import (placeholder for CSV/Excel)
router.post("/questions/bulk", async (req, res) => {
    try {
        const { questions } = req.body; // Array of question objects

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: "Invalid questions array" });
        }

        const results = await QuestionBank.insertMany(questions);

        res.status(201).json({
            message: `${results.length} questions imported successfully`,
            count: results.length
        });
    } catch (error) {
        console.error("Bulk import error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// INSTITUTION MANAGEMENT
// ============================================================================

// GET /api/super-admin/institutions - List all institutions
router.get("/institutions", async (req, res) => {
    try {
        const { status, plan, search, page = 1, limit = 10 } = req.query;

        const filter = {};
        if (status) filter["subscription.status"] = status;
        if (plan) filter["subscription.plan"] = plan;
        if (search) filter.name = { $regex: search, $options: 'i' };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const institutions = await Institution.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Institution.countDocuments(filter);

        res.json({
            institutions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Get institutions error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/super-admin/institutions/:id - View institution details
router.get("/institutions/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const institution = await Institution.findById(id);

        if (!institution) {
            return res.status(404).json({ error: "Institution not found" });
        }

        // Get additional stats
        const studentCount = await User.countDocuments({ institutionId: id, role: "student" });
        const eventCount = await Event.countDocuments({ institutionId: id });

        res.json({
            institution,
            stats: {
                totalStudents: studentCount,
                totalEvents: eventCount
            }
        });
    } catch (error) {
        console.error("Get institution error:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/super-admin/institutions/:id/suspend - Suspend institution
router.put("/institutions/:id/suspend", async (req, res) => {
    try {
        const { id } = req.params;

        const institution = await Institution.findByIdAndUpdate(
            id,
            { "subscription.status": "suspended" },
            { new: true }
        );

        if (!institution) {
            return res.status(404).json({ error: "Institution not found" });
        }

        res.json({ message: "Institution suspended successfully", institution });
    } catch (error) {
        console.error("Suspend institution error:", error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/super-admin/institutions/:id/activate - Activate institution
router.put("/institutions/:id/activate", async (req, res) => {
    try {
        const { id } = req.params;

        const institution = await Institution.findByIdAndUpdate(
            id,
            { "subscription.status": "active" },
            { new: true }
        );

        if (!institution) {
            return res.status(404).json({ error: "Institution not found" });
        }

        res.json({ message: "Institution activated successfully", institution });
    } catch (error) {
        console.error("Activate institution error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ANALYTICS
// ============================================================================

// GET /api/super-admin/analytics - Platform-wide analytics
router.get("/analytics", async (req, res) => {
    try {
        // Get growth data
        const institutionGrowth = await Institution.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const studentGrowth = await User.aggregate([
            {
                $match: { role: { $in: ["student", "independent"] } }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Question bank distribution
        const questionDistribution = await QuestionBank.aggregate([
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 }
                }
            }
        ]);

        const difficultyDistribution = await QuestionBank.aggregate([
            {
                $group: {
                    _id: "$level",
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            growth: {
                institutions: institutionGrowth,
                students: studentGrowth
            },
            questionBank: {
                byCategory: questionDistribution,
                byDifficulty: difficultyDistribution
            }
        });
    } catch (error) {
        console.error("Analytics error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

// GET /api/super-admin/settings - Get all settings
router.get("/settings", async (req, res) => {
    try {
        const settings = await PlatformSettings.find();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/super-admin/settings - Update or create a setting
router.post("/settings", async (req, res) => {
    try {
        const { key, value } = req.body;
        const setting = await PlatformSettings.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, new: true }
        );
        res.json({ message: "Setting updated", setting });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
