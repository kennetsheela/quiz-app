// superAdminRoutes.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const QuestionBank = require("../models/QuestionBank");
const Institution = require("../models/Institution");
const User = require("../models/User");
const Event = require("../models/Event");
const Analytics = require("../models/Analytics");
const PlatformSettings = require("../models/PlatformSettings");
const multer = require("multer");
const questionPipelineService = require("../services/questionPipelineService");
const pipelineService = require("../services/pipelineService");
const { safeSearchRegex } = require("../utils/escapeRegex");

// Multer: memory storage with file-type restriction
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        cb(new Error("Only PDF and DOC/DOCX files are allowed"));
    },
});

// ============================================================================
// AUTH MIDDLEWARE — JWT-based (replaces plaintext password on every request)
// ============================================================================

/**
 * verifySuperAdmin
 * Validates the JWT from Authorization header OR HttpOnly cookie.
 * The token must have been issued by /login below and contain role: "super-admin".
 */
const verifySuperAdmin = (req, res, next) => {
    // 1. Check Cookie (Preferred)
    let token = req.cookies?.adminToken;

    // 2. Check Authorization Header (Fallback for non-browser clients)
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token || token === "null" || token === "undefined") {
        return res.status(401).json({ success: false, message: "Authentication required. Please login as Super Admin." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

        if (decoded.role !== "super-admin") {
            console.warn(`[SuperAdmin] Role mismatch: ${decoded.role} tried to access super-admin route`);
            return res.status(403).json({ success: false, message: "Access denied. Super admin role required." });
        }

        req.superAdmin = decoded;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ success: false, message: "Session expired. Please login again." });
        }
        return res.status(401).json({ success: false, message: "Invalid token. Authorization denied." });
    }
};

// ============================================================================
// AUTHENTICATION — /login does NOT require the middleware (it's the entry point)
// ============================================================================

// POST /api/super-admin/login
// Issues a JWT on successful credential verification
router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME;
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

    // Constant-time comparison would be ideal; for now use strict equality with env vars
    if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
        const token = jwt.sign(
            { username, role: "super-admin" },
            process.env.JWT_SECRET,
            { algorithm: "HS256", expiresIn: "4h" }
        );

        // Set HttpOnly cookie for security
        res.cookie("adminToken", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
            sameSite: "Strict",
            maxAge: 4 * 60 * 60 * 1000, // 4 hours
        });

        return res.json({
            success: true,
            message: "Login successful",
            // Token is delivered via HttpOnly cookie only — not in body (prevents JS access)
            user: { username, role: "super-admin" },
        });
    }

    // Generic error — don't reveal which field was wrong
    return res.status(401).json({ success: false, message: "Invalid credentials." });
});

// ============================================================================
// APPLY auth middleware to ALL routes below this line
// ============================================================================
router.use(verifySuperAdmin);

// ============================================================================
// DASHBOARD
// ============================================================================

// GET /api/super-admin/dashboard
router.get("/dashboard", async (req, res, next) => {
    try {
        const [totalInstitutions, totalStudents, totalQuestions, totalEvents,
               activeInstitutions, suspendedInstitutions] = await Promise.all([
            Institution.countDocuments(),
            User.countDocuments({ role: { $in: ["student", "independent"] } }),
            QuestionBank.countDocuments(),
            Event.countDocuments(),
            Institution.countDocuments({ "subscription.status": "active" }),
            Institution.countDocuments({ "subscription.status": "suspended" }),
        ]);

        res.json({
            overview: {
                totalInstitutions,
                activeInstitutions,
                suspendedInstitutions,
                totalStudents,
                totalQuestions,
                totalEvents,
            },
        });
    } catch (error) {
        next(error); // Delegates to globalErrorHandler — no error.message leakage
    }
});

// ============================================================================
// QUESTION BANK MANAGEMENT
// ============================================================================

// POST /api/super-admin/questions - Add single question
router.post("/questions", async (req, res, next) => {
    try {
        const { category, topic, level, question, options, answer, explanation, tags } = req.body;

        const newQuestion = new QuestionBank({
            category,
            topic,
            level,
            question,
            options,
            answer,
            explanation,
            tags: tags || [],
            createdBy: req.superAdmin.username, // Use the authenticated admin's username
        });

        await newQuestion.save();
        res.status(201).json({ success: true, message: "Question added successfully", question: newQuestion });
    } catch (error) {
        next(error);
    }
});

// GET /api/super-admin/questions - List/filter questions
router.get("/questions", async (req, res, next) => {
    try {
        const { category, topic, level, search, page = 1, limit = 10 } = req.query;

        const filter = {};
        if (category) filter.category = category;
        if (topic) filter.topic = topic;
        if (level) filter.level = level;
        // FIX: escape user-supplied search string before using in regex (prevents ReDoS)
        if (search) {
            const safeRegex = safeSearchRegex(search);
            if (safeRegex) filter.question = safeRegex;
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // cap at 100
        const skip = (pageNum - 1) * limitNum;

        const [questions, total] = await Promise.all([
            QuestionBank.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
            QuestionBank.countDocuments(filter),
        ]);

        res.json({
            questions,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/super-admin/questions/:id - Edit question
router.put("/questions/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        // Whitelist updatable fields — prevents arbitrary field injection
        const { category, topic, level, question, options, answer, explanation, tags } = req.body;
        const updates = { category, topic, level, question, options, answer, explanation, tags };
        // Strip undefined keys
        Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

        const updated = await QuestionBank.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

        if (!updated) return res.status(404).json({ success: false, message: "Question not found" });

        res.json({ success: true, message: "Question updated successfully", question: updated });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/super-admin/questions/:id - Delete question
router.delete("/questions/:id", async (req, res, next) => {
    try {
        const question = await QuestionBank.findByIdAndDelete(req.params.id);
        if (!question) return res.status(404).json({ success: false, message: "Question not found" });
        res.json({ success: true, message: "Question deleted successfully" });
    } catch (error) {
        next(error);
    }
});

// POST /api/super-admin/questions/upload - Bulk upload via PDF/DOCX
router.post("/questions/upload", upload.single("file"), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        let questions = [];
        const { mimetype, buffer } = req.file;

        if (mimetype === "application/pdf") {
            questions = await questionPipelineService.parsePdf(buffer);
        } else if (
            mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mimetype === "application/msword"
        ) {
            questions = await questionPipelineService.parseDocx(buffer);
        } else {
            return res.status(400).json({ success: false, message: "Unsupported file format. Please upload PDF or DOCX." });
        }

        res.json({
            success: true,
            count: questions.length,
            questions: questions.map((q, idx) => ({ ...q, tempId: idx })),
        });
    } catch (error) {
        console.error("Upload error:", error.message);
        // Don't forward parsing library internals
        next(new Error("Failed to process question file. Please check the file format and try again."));
    }
});

// POST /api/super-admin/questions/pipeline - Full AI pipeline
router.post("/questions/pipeline", upload.single("file"), async (req, res, next) => {
    try {
        const { category, creatorId } = req.body;

        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
        if (!category) return res.status(400).json({ success: false, message: "Category is required" });

        const result = await pipelineService.runFullPipeline(
            req.file,
            category,
            req.superAdmin.username // Always use authenticated identity, not client-supplied
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
});

// POST /api/super-admin/questions/bulk - Bulk import array
router.post("/questions/bulk", async (req, res, next) => {
    try {
        const { questions } = req.body;

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid questions array" });
        }

        if (questions.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 questions per bulk upload" });
        }

        const currentCount = await QuestionBank.countDocuments();
        const questionsToInsert = questions.map((q, index) => ({
            ...q,
            questionID: `Q${String(currentCount + index + 1).padStart(3, "0")}`,
        }));

        const results = await QuestionBank.insertMany(questionsToInsert);

        res.status(201).json({
            success: true,
            message: `${results.length} questions imported successfully`,
            count: results.length,
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// INSTITUTION MANAGEMENT
// ============================================================================

// GET /api/super-admin/institutions
router.get("/institutions", async (req, res, next) => {
    try {
        const { status, plan, search, page = 1, limit = 10 } = req.query;

        const filter = {};
        if (status) filter["subscription.status"] = status;
        if (plan) filter["subscription.plan"] = plan;
        // FIX: escape search string (ReDoS prevention)
        if (search) {
            const safeRegex = safeSearchRegex(search);
            if (safeRegex) filter.name = safeRegex;
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
        const skip = (pageNum - 1) * limitNum;

        const [institutions, total] = await Promise.all([
            Institution.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
            Institution.countDocuments(filter),
        ]);

        res.json({
            institutions,
            pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/super-admin/institutions/:id
router.get("/institutions/:id", async (req, res, next) => {
    try {
        const institution = await Institution.findById(req.params.id);
        if (!institution) return res.status(404).json({ success: false, message: "Institution not found" });

        const [studentCount, eventCount] = await Promise.all([
            User.countDocuments({ institutionId: req.params.id, role: "student" }),
            Event.countDocuments({ institutionId: req.params.id }),
        ]);

        res.json({ institution, stats: { totalStudents: studentCount, totalEvents: eventCount } });
    } catch (error) {
        next(error);
    }
});

// PUT /api/super-admin/institutions/:id/suspend
router.put("/institutions/:id/suspend", async (req, res, next) => {
    try {
        const institution = await Institution.findByIdAndUpdate(
            req.params.id,
            { "subscription.status": "suspended" },
            { new: true }
        );
        if (!institution) return res.status(404).json({ success: false, message: "Institution not found" });
        res.json({ success: true, message: "Institution suspended successfully", institution });
    } catch (error) {
        next(error);
    }
});

// PUT /api/super-admin/institutions/:id/activate
router.put("/institutions/:id/activate", async (req, res, next) => {
    try {
        const institution = await Institution.findByIdAndUpdate(
            req.params.id,
            { "subscription.status": "active" },
            { new: true }
        );
        if (!institution) return res.status(404).json({ success: false, message: "Institution not found" });
        res.json({ success: true, message: "Institution activated successfully", institution });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// ANALYTICS
// ============================================================================

// GET /api/super-admin/analytics
router.get("/analytics", async (req, res, next) => {
    try {
        const [institutionGrowth, studentGrowth, questionDistribution, difficultyDistribution] = await Promise.all([
            Institution.aggregate([
                { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            User.aggregate([
                { $match: { role: { $in: ["student", "independent"] } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            QuestionBank.aggregate([
                { $group: { _id: "$category", count: { $sum: 1 } } },
            ]),
            QuestionBank.aggregate([
                { $group: { _id: "$level", count: { $sum: 1 } } },
            ]),
        ]);

        res.json({
            growth: { institutions: institutionGrowth, students: studentGrowth },
            questionBank: { byCategory: questionDistribution, byDifficulty: difficultyDistribution },
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

// GET /api/super-admin/settings
router.get("/settings", async (req, res, next) => {
    try {
        const settings = await PlatformSettings.find();
        res.json(settings);
    } catch (error) {
        next(error);
    }
});

// POST /api/super-admin/settings
router.post("/settings", async (req, res, next) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ success: false, message: "Setting key is required" });
        const setting = await PlatformSettings.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, new: true }
        );
        res.json({ success: true, message: "Setting updated", setting });
    } catch (error) {
        next(error);
    }
});

// PUT /api/super-admin/settings
router.put("/settings", async (req, res, next) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ success: false, message: "Setting key is required" });
        const setting = await PlatformSettings.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, new: true }
        );
        res.json({ success: true, message: "Setting updated", setting });
    } catch (error) {
        next(error);
    }
});

// Logout Route
router.post("/logout", (req, res) => {
    res.clearCookie("adminToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
        sameSite: "Strict",
    });
    res.json({ success: true, message: "Logged out successfully" });
});

module.exports = { router, verifySuperAdmin };
