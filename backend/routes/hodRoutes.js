//hodRoutes.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");

const hodOnly = [authenticate, allowRoles(["hod"])];
const User = require("../models/User");
const Department = require("../models/Department");
const Event = require("../models/Event");
const StudentProfile = require("../models/StudentProfile");
const Analytics = require("../models/Analytics");
const QuestionBank = require("../models/QuestionBank");
const EventService = require("../services/eventService");
const multer = require("multer");
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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

const EventParticipant = require("../models/EventParticipant");

// GET /api/hod/dashboard - Department-scoped dashboard
router.get("/dashboard", authenticate, allowRoles(["hod"]), async (req, res) => {
    try {
        const department = await Department.findById(req.user.hodDepartmentId || req.user.id).populate("institutionId", "name");

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const nameRegex = new RegExp(`^${department.name.trim().replace(/\s+/g, '\\s+')}$`, 'i');
        const codeRegex = new RegExp(`^${department.code.trim().replace(/\s+/g, '\\s+')}$`, 'i');

        const totalStudents = await User.countDocuments({
            institutionId: req.user.institutionId,
            department: { $in: [nameRegex, codeRegex] },
            role: "student"
        });

        const totalEvents = await Event.countDocuments({
            institutionId: req.user.institutionId,
            targetDepartments: { $in: [nameRegex, codeRegex] }
        });

        // Fetch recent events targeting this department
        const recentEvents = await Event.find({
            institutionId: req.user.institutionId,
            targetDepartments: { $in: [nameRegex, codeRegex] }
        })
            .sort({ createdAt: -1 })
            .limit(5);

        // Calculate average score across all students in the department
        const participantStats = await EventParticipant.aggregate([
            {
                $match: {
                    college: req.user.institutionId,
                    department: { $in: [nameRegex, codeRegex] }
                }
            },
            { $unwind: "$setResults" },
            { $match: { "setResults.percentage": { $ne: null } } },
            {
                $group: {
                    _id: null,
                    avgPercentage: { $avg: "$setResults.percentage" }
                }
            }
        ]);

        const averageScore = participantStats.length > 0 ? participantStats[0].avgPercentage : 0;

        res.json({
            department,
            user: req.user,
            stats: {
                totalStudents,
                totalEvents,
                averageScore
            },
            recentEvents
        });
    } catch (error) {
        console.error("HOD dashboard error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/hod/students - Department students only
router.get("/students", authenticate, allowRoles(["hod"]), async (req, res) => {
    try {
        const department = await Department.findById(req.user.hodDepartmentId || req.user.id);

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        const nameRegex = new RegExp(`^${department.name.trim().replace(/\s+/g, '\\s+')}$`, 'i');
        const codeRegex = new RegExp(`^${department.code.trim().replace(/\s+/g, '\\s+')}$`, 'i');

        const students = await User.find({
            institutionId: req.user.institutionId,
            department: { $in: [nameRegex, codeRegex] },
            role: "student"
        })
            .populate("batchId", "batchID")
            .select("-password");

        res.json({ students });
    } catch (error) {
        console.error("Get students error:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/hod/events - Create department events
router.post("/events", authenticate, allowRoles(["hod"]), upload.single("file"), async (req, res) => {
    try {
        const department = await Department.findById(req.user.hodDepartmentId);

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        // HOD often sends data in "eventData" field if it's FormData
        let data = req.body;
        if (req.body.data) {
            try {
                data = JSON.parse(req.body.data);
            } catch (e) {
                console.error("Error parsing eventData JSON:", e);
            }
        }

        const {
            eventName, adminPassword, studentPassword, category, duration,
            startTime, endTime, targetBatches, visibility, description,
            resultsVisibility, marksPerQ, negativeMarking, passPercentage, maxAttempts,
            proctoring, questionMethod, numQuestions, difficulty, quizSet
        } = data;

        if (!eventName || !adminPassword || !studentPassword || !startTime || !endTime) {
            return res.status(400).json({ error: "Required fields are missing (Event Name, Passwords, Dates)" });
        }

        const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
        const hashedStudentPassword = await bcrypt.hash(studentPassword, 10);

        let questions = [];

        // Logic for question selection
        if (questionMethod === 'upload' && req.file) {
            console.log("📂 Parsing questions from uploaded file...");
            questions = await EventService.parseQuestionsFromFile(req.file);
        } else if (questionMethod === 'random') {
            const count = parseInt(numQuestions) || 10;
            // QuestionBank uses lowercase enums: aptitude, reasoning, coding, technical
            const normalizedCategory = category ? category.toLowerCase().trim() : null;
            // QuestionBank uses lowercase level: easy, medium, hard
            const normalizedDifficulty = difficulty ? difficulty.toLowerCase().trim() : 'medium';

            const query = {};
            if (normalizedCategory && normalizedCategory !== 'general') {
                query.category = normalizedCategory;
            }
            if (normalizedDifficulty && normalizedDifficulty !== 'auto' && normalizedDifficulty !== 'all') {
                query.level = normalizedDifficulty;
            }

            console.log("🎲 Fetching random questions:", { query, count });

            const bankQuestions = await QuestionBank.aggregate([
                { $match: query },
                { $sample: { size: count } }
            ]);

            console.log(`🎲 Found ${bankQuestions.length} questions in Bank.`);

            questions = bankQuestions.map(q => ({
                question: q.question,
                options: q.options,
                answer: q.answer,
                category: q.category,
                topic: q.topic,
                level: q.level,
                explanation: q.explanation
            }));
        } else if (questionMethod === 'set' && quizSet) {
            console.log("📚 Fetching questions from set/topic:", quizSet);
            const count = parseInt(numQuestions) || 50;
            const bankQuestions = await QuestionBank.find({
                $or: [
                    { topic: new RegExp(quizSet, 'i') },
                    { tags: new RegExp(quizSet, 'i') }
                ]
            }).limit(count);

            console.log(`📚 Found ${bankQuestions.length} questions for set: ${quizSet}`);

            questions = bankQuestions.map(q => ({
                question: q.question,
                options: q.options,
                answer: q.answer,
                category: q.category,
                topic: q.topic,
                level: q.level,
                explanation: q.explanation
            }));
        }

        if (questions.length === 0) {
            if (questionMethod === 'upload') {
                return res.status(400).json({
                    error: "No questions could be parsed from the uploaded file. Please check the file format (numbered questions, A/B/C/D options, Answer: X)."
                });
            } else if (questionMethod === 'random') {
                return res.status(400).json({
                    error: "No questions found in the Question Bank for the selected category/difficulty. Please ask your Super Admin to populate the Question Bank, or use the 'Upload' method to add questions from a file."
                });
            } else if (questionMethod === 'set') {
                return res.status(400).json({
                    error: "No questions found for the selected topic/set. Please ask your Super Admin to add questions with that topic to the Question Bank, or use the 'Upload' method."
                });
            }
        }

        // Fetch institution name for caching
        const institution = await Institution.findById(req.user.institutionId);

        const event = new Event({
            eventName,
            adminPassword: hashedAdminPassword,
            studentPassword: hashedStudentPassword,
            category: category || "General",
            description: description || "",
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            institutionId: req.user.institutionId,
            institutionName: institution ? institution.name : "Institution",
            targetDepartments: [
                department.name,
                department.name.replace(/\s+/g, ' ').trim(),
                department.code,
                department._id.toString()
            ],
            targetBatches: targetBatches || [],
            visibility: visibility || "department",
            resultsVisibility: resultsVisibility || "rank_and_scores",
            createdBy: req.user.uid,
            createdByRole: "hod",
            createdByDeptName: department.name,
            marksPerQuestion: parseInt(marksPerQ) || 1,
            negativeMarking: parseFloat(negativeMarking) || 0,
            passPercentage: parseInt(passPercentage) || 40,
            maxAttempts: parseInt(maxAttempts) || 1,
            proctoringConfig: proctoring || {
                fullscreen: true,
                tabSwitch: true,
                randomizeQuestions: true,
                randomizeOptions: true
            },
            sets: [{
                setName: "Main Set",
                timeLimit: parseInt(duration) || 60,
                isActive: true,
                questions: questions
            }]
        });
        await event.save();
        res.status(201).json({ message: "Event created successfully", event });

    } catch (error) {
        console.error("Create event error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/hod/events/:eventId/scores — Department-filtered participant scores
router.get("/events/:eventId/scores", authenticate, allowRoles(["hod"]), async (req, res) => {
    try {
        const { eventId } = req.params;
        const department = await Department.findById(req.user.hodDepartmentId);
        if (!department) return res.status(404).json({ error: "Department not found" });

        // Verify event belongs to this HOD
        const event = await Event.findOne({ _id: eventId, createdBy: req.user.uid });
        if (!event) return res.status(404).json({ error: "Event not found or not owned by you" });

        // Get all participants for this event
        const allParticipants = await EventParticipant.find({ eventId });

        // Get all students in this department to cross-reference
        const nameRegex = new RegExp(`^${department.name.trim().replace(/\s+/g, '\\s+')}$`, 'i');
        const codeRegex = new RegExp(`^${department.code.trim().replace(/\s+/g, '\\s+')}$`, 'i');
        const deptStudents = await User.find({
            institutionId: req.user.institutionId,
            department: { $in: [nameRegex, codeRegex] },
            role: "student"
        }).select("email name rollNumber batchId department").populate("batchId", "batchID name");

        const deptEmailSet = new Set(deptStudents.map(s => s.email.toLowerCase()));

        // Filter participants to only dept students and map scores
        const scores = allParticipants
            .filter(p => deptEmailSet.has((p.email || '').toLowerCase()))
            .map(p => {
                const student = deptStudents.find(s => s.email.toLowerCase() === (p.email || '').toLowerCase());
                const latestResult = p.setResults && p.setResults.length > 0 ? p.setResults[p.setResults.length - 1] : null;
                const total = latestResult?.totalQuestions || 0;
                const correct = latestResult?.correctAnswers || 0;
                const wrong = latestResult?.wrongAnswers || 0;
                const pct = total > 0 ? parseFloat(((correct / total) * 100).toFixed(2)) : 0;
                return {
                    name: student ? student.name : (p.email || 'Unknown'),
                    email: p.email,
                    rollNumber: student?.rollNumber || p.rollNo || '—',
                    department: student?.department || department.name,
                    batch: student?.batchId?.batchID || student?.batchId?.name || '—',
                    correct,
                    wrong,
                    total,
                    scorePercent: pct,
                    attemptedAt: latestResult?.completedAt || p.createdAt
                };
            })
            .sort((a, b) => b.scorePercent - a.scorePercent);

        res.json({ eventName: event.eventName, scores });
    } catch (error) {
        console.error("HOD event scores error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
