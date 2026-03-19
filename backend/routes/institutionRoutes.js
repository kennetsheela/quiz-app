//institutionRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const admin = require("firebase-admin");
const router = express.Router();
const Institution = require("../models/Institution");
const Department = require("../models/Department");
const Batch = require("../models/Batch");
const User = require("../models/User");
const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");
const QuestionBank = require("../models/QuestionBank");
const EventService = require("../services/eventService");
const multer = require("multer");
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
const { authenticate, allowRoles, isolateInstitution } = require("../middleware/authMiddleware");
const { safeSearchRegex, safeExactRegex } = require("../utils/escapeRegex");

const instAdminOnly = [authenticate, allowRoles(["institutionAdmin"])];
const staffOnly = [authenticate, allowRoles(["institutionAdmin", "hod"])];

// ─── Helper: get ordinal year label ─────────────────────────────────────────
function ordinalBatchYear(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Create new institution (Onboarding) ────────────────────────────────────
router.post("/", authenticate, async (req, res) => {
    try {
        const { name, type, email, phone, location, academicConfig } = req.body;

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
            subscription: { plan: "free", status: "active" },
            academicConfig
        });

        // Link user to institution and set role
        await User.findOneAndUpdate(
            { firebaseUid: req.user.uid },
            { role: "inst-admin", institutionId: inst._id },
            { upsert: true }
        );

        res.status(201).json({ message: "Institution registered successfully", institution: inst });
    } catch (error) {
        console.error("Institution registration error:", error);
        res.status(500).json({ error: "Failed to register institution. Please try again." });
    }
});

// ─── Get institution details (Current User's) ────────────────────────────────
router.get("/my", authenticate, async (req, res) => {
    try {
        if (!req.user.institutionId) {
            return res.status(404).json({ error: "No institution linked to this account" });
        }
        const inst = await Institution.findById(req.user.institutionId);
        if (!inst) {
            return res.status(404).json({ error: "Institution not found" });
        }
        res.json({ institution: inst });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch institution details." });
    }
});

// ─── Get institution details by ID ───────────────────────────────────────────
router.get("/:id", authenticate, isolateInstitution, async (req, res) => {
    try {
        const inst = await Institution.findById(req.params.id);
        if (!inst) {
            return res.status(404).json({ error: "Institution not found" });
        }
        res.json({ institution: inst });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch institution details." });
    }
});

// ─── Manage Departments ──────────────────────────────────────────────────────
router.post("/:institutionId/departments", instAdminOnly, isolateInstitution, async (req, res) => {
    try {
        const { name, code, hodName, hodEmail, hodPhone } = req.body;
        const institutionId = req.params.institutionId;

        const dept = await Department.findOneAndUpdate(
            { institutionId, code },
            { name, code, hodName, hodEmail, hodPhone, institutionId },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(201).json({ department: dept });
    } catch (error) {
        res.status(500).json({ error: "Failed to save department." });
    }
});

// ─── Bulk Setup: departments, batches, HODs ──────────────────────────────────
// BUG FIX: HOD upsert now correctly handles missing firebaseUid
// using $setOnInsert so existing docs are never overwritten with null
router.post("/setup", instAdminOnly, async (req, res) => {
    try {
        const { departments, batches, hods } = req.body;
        const inst = await Institution.findById(req.user.institutionId);

        if (!inst) {
            return res.status(404).json({ error: "Institution not found" });
        }

        // 1. Create / update Departments
        const deptMap = {}; // departmentName -> _id
        if (departments && departments.length > 0) {
            for (const deptData of departments) {
                const dept = await Department.findOneAndUpdate(
                    { institutionId: inst._id, code: deptData.code },
                    { name: deptData.name, code: deptData.code, institutionId: inst._id },
                    { upsert: true, new: true }
                );
                deptMap[dept.name] = dept._id;
            }
        }

        // 2. Create / update Batches
        if (batches && batches.length > 0) {
            for (const batchData of batches) {
                await Batch.findOneAndUpdate(
                    { institutionId: inst._id, batchID: batchData.batchID },
                    {
                        ...batchData,
                        batchID: batchData.batchID,
                        institutionId: inst._id
                    },
                    { upsert: true, new: true }
                );
            }
        }

        // 3. Create / update HOD User records
        // BUG FIX: firebaseUid must NOT be set on upsert-create for HODs —
        // they don't have one yet. We use $setOnInsert only for fields that
        // should only be written on first creation, and $set for fields that
        // should always be updated. This avoids the duplicate-null crash.
        if (hods && hods.length > 0) {
            for (const hodData of hods) {
                if (!hodData.email || !hodData.name) continue; // skip incomplete HODs

                const deptId = deptMap[hodData.departmentName];

                if (deptId) {
                    // Update Department with HOD info
                    await Department.findByIdAndUpdate(deptId, {
                        hodName: hodData.name,
                        hodEmail: hodData.email,
                        hodPermissions: hodData.permissions
                    });

                    // Create/Update HOD User record
                    // $set    → always update these fields
                    // $setOnInsert → only write these when creating a NEW document
                    await User.findOneAndUpdate(
                        { email: hodData.email.toLowerCase() },
                        {
                            $set: {
                                username: hodData.name,
                                role: "hod",
                                institutionId: inst._id,
                                hodDepartmentId: deptId,
                                hodPermissions: hodData.permissions || {
                                    viewDepartmentStudents: true,
                                    viewDepartmentAnalytics: true,
                                    createDepartmentEvents: true,
                                    createCrossDepartmentEvents: false,
                                    addStudents: true,
                                    editStudents: true,
                                    deleteStudents: false,
                                    generateReports: true,
                                    sendNotifications: true
                                }
                            },
                            $setOnInsert: {
                                // firebaseUid is intentionally omitted here —
                                // the HOD will link their Firebase account on
                                // first login. With sparse:true on the index,
                                // missing firebaseUid is safe.
                                email: hodData.email.toLowerCase(),
                                isPasswordSet: false
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
            }
        }

        // Mark setup as completed
        inst.setupCompleted = true;
        await inst.save();

        res.json({ message: "Setup completed successfully", institution: inst });
    } catch (error) {
        console.error("Setup error:", error);
        res.status(500).json({ error: "Setup failed. Please try again." });
    }
});

// ─── Login endpoint ──────────────────────────────────────────────────────────
router.post("/login", authenticate, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) {
            return res.status(404).json({ error: "No institution found for this account", needsSetup: true });
        }
        res.json({ message: "Login successful", institution: inst });
    } catch (error) {
        console.error("Institution login error:", error);
        res.status(500).json({ error: "Login failed. Please try again." });
    }
});

// ─── Public Registration (requires Firebase auth to prevent UID spoofing) ──────
// FIX: Added authenticate middleware. adminUID is now taken from the verified token,
// not from the request body. This prevents any user claiming another user's UID.
router.post("/register", authenticate, async (req, res) => {
    try {
        const { name, type, email, phone, location, subscription } = req.body;

        // FIX: Always use the server-verified UID from the JWT/Firebase token
        const adminUID = req.user.uid;

        const existing = await Institution.findOne({ $or: [{ email }, { name }] });
        if (existing) {
            return res.status(400).json({ error: "Institution already registered" });
        }

        const institution = new Institution({ name, type, adminUID, email, phone, location, subscription });
        await institution.save();

        // FIX: Use findOneAndUpdate with upsert to prevent Duplicate Key errors
        // and ensure the user record is correctly linked to the new institution.
        const adminUser = await User.findOneAndUpdate(
            { firebaseUid: adminUID },
            {
                email,
                username: name,
                role: "inst-admin",
                institutionId: institution._id
            },
            { upsert: true, new: true }
        );

        res.status(201).json({ message: "Institution registered successfully", institution });
    } catch (error) {
        console.error("Institution Registration Error:", {
            message: error.message,
            stack: error.stack,
            user: req.user?.uid
        });
        res.status(500).json({ error: "Registration failed. Please try again." });
    }
});

// ─── Update Institution Profile ──────────────────────────────────────────────
router.put("/:id", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized to manage this institution" });
        }

        const { name, type, email, phone, location, academicConfig } = req.body;

        const updatedInst = await Institution.findByIdAndUpdate(
            institutionId,
            {
                $set: {
                    ...(name && { name }),
                    ...(type && { type }),
                    ...(email && { email }),
                    ...(phone && { phone }),
                    ...(location && { location }),
                    ...(academicConfig && { academicConfig })
                }
            },
            { new: true, runValidators: true }
        );

        if (!updatedInst) {
            return res.status(404).json({ error: "Institution not found" });
        }

        res.json({ message: "Profile updated successfully", institution: updatedInst });
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ error: "Failed to update institution profile." });
    }
});



// ─── Delete Department ──────────────────────────────────────────────────────
router.delete("/:id/departments/:deptId", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }

        // 1. Delete the department
        await Department.findByIdAndDelete(req.params.deptId);

        // 2. Unset from batches
        await Batch.updateMany({ departmentId: req.params.deptId }, { $unset: { departmentId: "" } });

        // 3. Clear from users who had this as their HOD department
        await User.updateMany({ hodDepartmentId: req.params.deptId }, { $unset: { hodDepartmentId: "" }, $set: { role: "student" } });

        res.json({ message: "Department deleted successfully" });
    } catch (error) {
        console.error("Delete department error:", error);
        res.status(500).json({ error: "Failed to delete department." });
    }
});

// ─── Get Departments by Institution ID ──────────────────────────────────────
router.get("/:id/departments", authenticate, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const departments = await Department.find({ institutionId }).lean();

        // 1. Fetch Students & Events for aggregation
        const [studentAgg, eventAgg] = await Promise.all([
            User.aggregate([
                { $match: { institutionId: new mongoose.Types.ObjectId(institutionId), role: "student" } },
                { $group: { _id: "$department", total: { $sum: 1 } } }
            ]),
            Event.aggregate([
                { $match: { institutionId: new mongoose.Types.ObjectId(institutionId) } },
                { $unwind: "$targetDepartments" },
                { $group: { _id: "$targetDepartments", total: { $sum: 1 } } }
            ])
        ]);

        // 2. Map counts back to each department using flexible matching
        const enrichedDepts = departments.map(dept => {
            const nameRegex = new RegExp(`^${dept.name.trim().replace(/\s+/g, '\\s+')}$`, 'i');
            const codeRegex = new RegExp(`^${dept.code.trim().replace(/\s+/g, '\\s+')}$`, 'i');

            const studentCount = studentAgg.reduce((sum, agg) => {
                if (agg._id && (nameRegex.test(agg._id) || codeRegex.test(agg._id))) {
                    return sum + agg.total;
                }
                return sum;
            }, 0);

            const eventCount = eventAgg.reduce((sum, agg) => {
                if (agg._id && (nameRegex.test(agg._id) || codeRegex.test(agg._id))) {
                    return sum + agg.total;
                }
                return sum;
            }, 0);

            return {
                ...dept,
                statistics: {
                    totalStudents: studentCount,
                    totalEvents: eventCount,
                    averageScore: dept.statistics?.averageScore || 0
                }
            };
        });

        res.json({ departments: enrichedDepts });
    } catch (error) {
        console.error("Fetch departments error:", error);
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

// ─── Add Batch ───────────────────────────────────────────────────────────────
router.post("/:id/batches", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const { departmentId, name, batchID, startYear, endYear, currentYearLevel, graduationDate } = req.body;

        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }

        const batchData = await Batch.findOneAndUpdate(
            { institutionId: req.params.id, batchID: batchID || name },
            {
                institutionId: req.params.id,
                departmentId,
                batchID: batchID || name,
                startYear,
                endYear,
                currentYearLevel: currentYearLevel || 1,
                graduationDate,
                status: "active"
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(201).json({ batch: batchData });
    } catch (error) {
        console.error("Add batch error:", error);
        res.status(500).json({ error: "Failed to add batch." });
    }
});

// ─── Get Batches ─────────────────────────────────────────────────────────────
router.get("/:id/batches", authenticate, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user || (user.institutionId.toString() !== req.params.id && user.role !== "super-admin")) {
            return res.status(403).json({ error: "Access denied" });
        }
        const batches = await Batch.find({ institutionId: req.params.id }).populate("departmentId", "name code");
        res.json({ batches });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch batches" });
    }
});

// ─── Institution Dashboard Stats ─────────────────────────────────────────────
router.get("/:institutionId/dashboard", instAdminOnly, isolateInstitution, async (req, res) => {
    try {
        const institutionId = req.params.institutionId;
        const [totalEvents, completedEvents, activeEventCount] = await Promise.all([
            Event.countDocuments({ institutionId }),
            Event.countDocuments({ institutionId, status: "Completed" }),
            Event.countDocuments({ institutionId, status: "Active" })
        ]);

        // Calculate average score across all completed attempts for this institution
        const scoreAgg = await EventParticipant.aggregate([
            { $match: { college: new mongoose.Types.ObjectId(institutionId) } },
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            { $group: { _id: null, avgScore: { $avg: "$setResults.percentage" } } }
        ]);
        const averageScore = scoreAgg.length > 0 ? Math.round(scoreAgg[0].avgScore) : 0;

        const activeEventDocs = await Event.find({ institutionId, status: { $in: ["Active", "Pending"] } })
            .sort({ startTime: -1 })
            .limit(5)
            .select("eventName startTime status participantCount category visibility");

        res.json({
            metrics: {
                totalEvents,
                completedEvents,
                averageScore,
                activeEvents: activeEventCount
            },
            activeEvents: activeEventDocs.map(e => ({
                _id: e._id,
                name: e.eventName,
                category: e.category || "General",
                type: e.visibility === "public" ? "Public" : "Private",
                start: e.startTime,
                participants: e.participantCount || 0,
                status: e.status || "Pending"
            }))
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to load dashboard" });
    }
});

// ─── Events List ─────────────────────────────────────────────────────────────
router.get("/:id/events", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { status, type, category, search } = req.query;
        const query = { institutionId };
        if (status) query.status = status;
        if (category) {
            const safeCategory = safeSearchRegex(category);
            if (safeCategory) query.category = safeCategory;
        }
        if (type) query.isPublic = (type.toLowerCase() === "public");
        if (search) {
            const safeSearch = safeSearchRegex(search);
            if (safeSearch) query.eventName = safeSearch;
        }

        const events = await Event.find(query).sort({ createdAt: -1 }).select(
            "eventName category visibility isPublic startTime status participantCount createdAt createdByDeptName institutionName"
        );
        res.json({
            events: events.map(e => ({
                _id: e._id,
                name: e.eventName,
                category: e.category || "General",
                type: (e.visibility === "public" || e.isPublic) ? "Public" : "Private",
                start: e.startTime,
                participants: e.participantCount || 0,
                status: e.status || "Pending",
                createdByDeptName: e.createdByDeptName,
                institutionName: e.institutionName
            }))
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

// ─── Get Event Participants (Eye Icon Modal) ──────────────────────────────────
router.get("/:id/events/:eventId/participants", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const { eventId } = req.params;

        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        const participants = await EventParticipant.find({ eventId })
            .select("rollNo firstName lastName department email setResults")
            .lean();

        const enriched = await Promise.all(participants.map(async p => {
            const user = await User.findOne({ email: p.email })
                .populate({ path: 'batchId', select: 'currentYearLevel' });

            const latestResult = p.setResults && p.setResults.length > 0
                ? p.setResults[p.setResults.length - 1]
                : null;

            let timeStr = "00:00";
            if (latestResult && latestResult.timeTaken) {
                const mins = Math.floor(latestResult.timeTaken / 60);
                const secs = latestResult.timeTaken % 60;
                timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }

            return {
                rollNo: p.rollNo || "N/A",
                name: `${p.firstName} ${p.lastName}`,
                department: p.department || "General",
                year: user?.batchId?.currentYearLevel || "N/A",
                score: latestResult ? latestResult.score : "N/A",
                timeSpent: timeStr
            };
        }));

        res.json({ participants: enriched });
    } catch (error) {
        console.error("View participants error:", error);
        res.status(500).json({ error: "Failed to fetch participant details" });
    }
});

// ─── Create Event ─────────────────────────────────────────────────────────────
router.post("/:id/events", instAdminOnly, upload.single('file'), async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // Multer makes body fields strings if they are sent as FormData
        const body = req.body;
        const name = body.name;
        const category = body.category || "General";
        const type = body.type;
        const start = body.start;
        const end = body.end;
        const duration = parseInt(body.duration) || 60;
        const description = body.description;

        // Parse JSON strings from FormData
        const targetDepts = body.targetDepts ? JSON.parse(body.targetDepts) : [];
        const targetBatches = body.targetBatches ? JSON.parse(body.targetBatches) : [];
        const proctoring = body.proctoring ? JSON.parse(body.proctoring) : {};

        const questionMethod = body.questionMethod || 'random';

        if (!name || !start || !end) {
            return res.status(400).json({ error: "Name, start date, and end date are required" });
        }

        let questions = [];
        if (questionMethod === 'upload' && req.file) {
            questions = await EventService.parseQuestionsFromFile(req.file, {
                category: category,
                defaultTopic: name,
                defaultLevel: "medium"
            });
        } else if (questionMethod === 'random') {
            const numQuestions = parseInt(body.numQuestions) || 10;
            // Fetch random questions from QuestionBank matching the category
            const randomQuestions = await QuestionBank.aggregate([
                { $match: { category: category.toLowerCase() } },
                { $sample: { size: numQuestions } }
            ]);

            questions = randomQuestions.map(q => ({
                question: q.question,
                options: q.options,
                answer: q.answer,
                explanation: q.explanation || ""
            }));

            console.log(`🎲 Selected ${questions.length} random questions for category: ${category}`);
        } else if (questionMethod === 'set') {
            // Placeholder for set logic - for now fallback to random if no sets specified
            const numQuestions = parseInt(body.numQuestions) || 10;
            const randomQuestions = await QuestionBank.aggregate([
                { $match: { category: category.toLowerCase() } },
                { $sample: { size: numQuestions } }
            ]);
            questions = randomQuestions.map(q => ({
                question: q.question,
                options: q.options,
                answer: q.answer,
                explanation: q.explanation || ""
            }));
        }

        if (questions.length === 0) {
            return res.status(400).json({
                error: "No questions found for the selected category. Please ensure the Question Bank has content or upload a file."
            });
        }

        // Manual sets logic (if upload, create one set)
        const eventSets = [
            {
                setName: "Main Set",
                timeLimit: duration,
                isActive: true, // Auto-activate the only set for now
                questions: questions,
                originalFilename: req.file ? req.file.originalname : null
            }
        ];

        const inst = await Institution.findById(institutionId);

        const event = new Event({
            eventName: name,
            category: category,
            description: description,
            resultsVisibility: body.resultsVisibility || "rank_and_scores",
            visibility: type === "Public" ? "public" : "institution",
            isPublic: (type === "Public"),
            startTime: new Date(start),
            endTime: new Date(end),
            duration: duration,
            institutionId: new mongoose.Types.ObjectId(institutionId),
            institutionName: inst ? inst.name : "Institution",
            targetDepartments: targetDepts,
            targetBatches: targetBatches,
            createdBy: req.instAdmin.uid,
            createdByRole: "inst-admin",
            adminPassword: Math.random().toString(36).slice(-8),
            studentPassword: Math.random().toString(36).slice(-6),
            sets: eventSets,
            status: "Pending", // Start as Pending; admin activates manually
            marksPerQuestion: parseInt(body.marksPerQ) || 1,
            negativeMarking: parseFloat(body.negativeMarking) || 0,
            passPercentage: parseInt(body.passPercentage) || 40,
            maxAttempts: parseInt(body.maxAttempts) || 1,
            proctoringConfig: {
                fullscreen: proctoring.fullscreen || false,
                tabSwitch: proctoring.tabLock || false,
                webcam: proctoring.faceRecognition || false,
                randomizeQuestions: proctoring.randomizeQ || false,
                randomizeOptions: true
            }
        });

        await event.save();

        res.status(201).json({
            message: "Event created and launched successfully",
            event: {
                _id: event._id,
                name: event.eventName,
                category: event.category,
                status: event.status,
                start: event.startTime,
                participants: 0
            }
        });
    } catch (error) {
        console.error("Create event error:", error);
        res.status(500).json({ error: "Failed to create event." });
    }
});

// Update Event Status (Activate/Complete)
router.patch("/:id/events/:eventId/status", instAdminOnly, async (req, res) => {
    try {
        const { status } = req.body;
        if (!["Active", "Pending", "Completed"].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const event = await Event.findOneAndUpdate(
            { _id: req.params.eventId, institutionId: req.params.id },
            { $set: { status: status } },
            { new: true }
        );

        if (!event) return res.status(404).json({ error: "Event not found" });

        res.json({ message: `Event status updated to ${status}`, status: event.status });
    } catch (error) {
        res.status(500).json({ error: "Failed to update event status." });
    }
});

// ─── Repair Student Batch References ──────────────────────────────────────────
// POST /:id/students/repair-batches — fix legacy string batchId references
router.post("/:id/students/repair-batches", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        const batches = await Batch.find({ institutionId }).select("_id batchID").lean();
        const batchMap = {};
        batches.forEach(b => {
            batchMap[b.batchID] = b._id;
            batchMap[b._id.toString()] = b._id;
        });

        const students = await User.find({ institutionId, role: "student" }).select("_id batchId");
        let fixedCount = 0;

        for (const student of students) {
            const currentId = student.batchId;
            if (!currentId) continue;

            const currentIdStr = currentId.toString();
            // If it's a string matching a batchID, or a mismatching ObjectId
            const resolvedId = batchMap[currentIdStr];

            if (resolvedId && currentIdStr !== resolvedId.toString()) {
                student.batchId = resolvedId;
                await student.save();
                fixedCount++;
            }
        }

        res.json({
            message: `Repaired batch references for ${fixedCount} students`,
            fixedCount
        });
    } catch (error) {
        console.error("Repair batches error:", error);
        res.status(500).json({ error: "Failed to repair batch references" });
    }
});

// ─── Backfill Participant Counts ───────────────────────────────────────────────
// POST /:id/events/backfill-counts — recount participants for all events
router.post("/:id/events/backfill-counts", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // Get all events for this institution
        const events = await Event.find({ institutionId }).select("_id eventName");

        const updates = [];
        for (const event of events) {
            const count = await EventParticipant.countDocuments({ eventId: event._id });
            if (count > 0) {
                updates.push(
                    Event.findByIdAndUpdate(event._id, { $set: { participantCount: count } })
                );
            }
        }

        await Promise.all(updates);

        res.json({
            message: `Backfilled participant counts for ${events.length} events`,
            updated: updates.length
        });
    } catch (error) {
        console.error("Backfill counts error:", error);
        res.status(500).json({ error: "Failed to backfill participant counts" });
    }
});

// ─── Student Stats ────────────────────────────────────────────────────────────
router.get("/:id/students/stats", instAdminOnly, isolateInstitution, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const [total, active] = await Promise.all([
            User.countDocuments({ institutionId, role: "student" }),
            User.countDocuments({ institutionId, role: "student", status: { $ne: "alumni" } })
        ]);

        // Dept-wise counts
        // 1. Fetch all departments for this institution
        const depts = await Department.find({ institutionId });
        const perDepartment = {};

        // 2. Aggregate counts by department string
        const deptAgg = await User.aggregate([
            { $match: { institutionId: new mongoose.Types.ObjectId(institutionId), role: "student" } },
            { $group: { _id: "$department", total: { $sum: 1 } } }
        ]);

        // 3. Map counts back to department Codes/Names using flexible matching
        depts.forEach(d => {
            perDepartment[d.code] = { total: 0, name: d.name };
        });

        deptAgg.forEach(agg => {
            if (!agg._id) return;
            // Find which department this string corresponds to
            const matchedDept = depts.find(d => {
                const nameRegex = new RegExp(`^${d.name.trim().replace(/\s+/g, '\\s+')}$`, 'i');
                const codeRegex = new RegExp(`^${d.code.trim().replace(/\s+/g, '\\s+')}$`, 'i');
                return nameRegex.test(agg._id) || codeRegex.test(agg._id);
            });

            if (matchedDept) {
                perDepartment[matchedDept.code].total += agg.total;
            } else {
                // Fallback for students with manual department entries
                if (!perDepartment[agg._id]) perDepartment[agg._id] = { total: 0 };
                perDepartment[agg._id].total += agg.total;
            }
        });

        // Batch-wise counts
        const batchAgg = await User.aggregate([
            { $match: { institutionId: new mongoose.Types.ObjectId(institutionId), role: "student" } },
            { $group: { _id: "$batchId", total: { $sum: 1 } } },
            {
                $lookup: {
                    from: "batches",
                    localField: "_id",
                    foreignField: "_id",
                    as: "batchInfo"
                }
            },
            { $unwind: "$batchInfo" },
            { $project: { batchName: "$batchInfo.batchID", total: 1 } }
        ]);
        const perBatch = {};
        batchAgg.forEach(b => { if (b.batchName) perBatch[b.batchName] = { total: b.total }; });

        res.json({ total, active, alumni: total - active, perDepartment, perBatch });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch student stats" });
    }
});

// ─── Active Batches ──────────────────────────────────────────────────────────
router.get("/:id/batches/active", staffOnly, isolateInstitution, async (req, res) => {
    try {
        const institutionId = req.params.id;
        // 1. Get all batches
        const batches = await Batch.find({ institutionId, status: "active" })
            .populate("departmentId", "name code")
            .sort({ startYear: -1 });

        // 2. Count students per batch (handling both ObjectId and string matches)
        // This is robust against data imported incorrectly as strings
        const batchIds = batches.map(b => b._id);
        const batchStringIDs = batches.map(b => b.batchID);

        const studentCounts = await User.aggregate([
            {
                $match: {
                    institutionId: new mongoose.Types.ObjectId(institutionId),
                    role: "student",
                    $or: [
                        { batchId: { $in: batchIds } },
                        { batchId: { $in: batchStringIDs } }
                    ]
                }
            },
            { $group: { _id: "$batchId", count: { $sum: 1 } } }
        ]);

        const countMap = {};
        // Map both ways to be safe
        const batchMap = {};
        batches.forEach(b => {
            batchMap[b._id.toString()] = b._id;
            if (b.batchID) batchMap[b.batchID] = b._id;
        });

        studentCounts.forEach(sc => {
            const bIdStr = sc._id ? sc._id.toString() : null;
            if (!bIdStr) return;
            // Find which batch this count belongs to
            const actualBatch = batches.find(b => b._id.toString() === bIdStr || b.batchID === bIdStr);
            if (actualBatch) {
                const key = actualBatch._id.toString();
                countMap[key] = (countMap[key] || 0) + sc.count;
            }
        });

        const enriched = batches.map(b => ({
            ...b.toObject(),
            studentCount: countMap[b._id.toString()] || 0
        }));

        res.json({ batches: enriched });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch active batches" });
    }
});

// ─── Graduated Batches ────────────────────────────────────────────────────────
router.get("/:id/batches/graduated", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        // 1. Get all batches
        const batches = await Batch.find({ institutionId, status: { $in: ["graduated", "alumni"] } })
            .populate("departmentId", "name code")
            .sort({ endYear: -1 });

        // 2. Count students per batch (handling both ObjectId and string matches)
        const batchIds = batches.map(b => b._id);
        const batchStringIDs = batches.map(b => b.batchID);

        const studentCounts = await User.aggregate([
            {
                $match: {
                    institutionId: new mongoose.Types.ObjectId(institutionId),
                    role: "student",
                    $or: [
                        { batchId: { $in: batchIds } },
                        { batchId: { $in: batchStringIDs } }
                    ]
                }
            },
            { $group: { _id: "$batchId", count: { $sum: 1 } } }
        ]);

        const countMap = {};
        studentCounts.forEach(sc => {
            const bIdStr = sc._id ? sc._id.toString() : null;
            if (!bIdStr) return;
            const actualBatch = batches.find(b => b._id.toString() === bIdStr || b.batchID === bIdStr);
            if (actualBatch) {
                const key = actualBatch._id.toString();
                countMap[key] = (countMap[key] || 0) + sc.count;
            }
        });

        const enriched = batches.map(b => ({
            ...b.toObject(),
            studentCount: countMap[b._id.toString()] || 0
        }));

        res.json({ batches: enriched });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch graduated batches" });
    }
});

// ─── Batch Detail with Progression ──────────────────────────────────────────
router.get("/:id/batches/:batchId/details", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batchDoc = await Batch.findOne({ institutionId, _id: req.params.batchId }).populate("departmentId", "name code");
        if (!batchDoc) return res.status(404).json({ error: "Batch not found" });

        const currentCalYear = new Date().getFullYear();
        const years = [];
        for (let y = batchDoc.startYear; y <= batchDoc.endYear; y++) years.push(y);

        const currentYear = Math.min(currentCalYear, batchDoc.endYear);
        const yearLevel = currentYear - batchDoc.startYear + 1;
        const yearLabel = ordinalBatchYear(Math.max(1, Math.min(yearLevel, years.length)));

        // dept distribution
        const deptAgg = await User.aggregate([
            { $match: { institutionId: new mongoose.Types.ObjectId(institutionId), role: "student", batchId: new mongoose.Types.ObjectId(batchDoc._id) } },
            { $group: { _id: "$department", count: { $sum: 1 } } }
        ]);
        const deptDistribution = {};
        deptAgg.forEach(d => { if (d._id) deptDistribution[d._id] = d.count; });

        const studentCount = batchDoc.statistics?.totalStudents || Object.values(deptDistribution).reduce((s, v) => s + v, 0);

        // Build performance progression from statistics
        const perf = [];
        for (let i = 1; i <= Math.min(yearLevel, years.length); i++) {
            const isCurrent = i === yearLevel;
            let label = `${ordinalBatchYear(i)} Year`;
            if (isCurrent) {
                label += ' (Now)';
                if (i === 4) label += ' - Graduating Soon';
            }
            perf.push({
                yr: label,
                avg: batchDoc.statistics?.averageScore ? `${batchDoc.statistics.averageScore.toFixed(1)}%` : 'N/A',
                change: i === 1 ? null : null
            });
        }

        res.json({
            batchId: batchDoc.batchID,
            years,
            currentYear,
            currentYearLabel: yearLabel,
            studentCount,
            deptDistribution,
            performanceProgression: perf
        });
    } catch (error) {
        console.error("Batch detail error:", error);
        res.status(500).json({ error: "Failed to fetch batch details" });
    }
});

// ─── Graduate a Batch ─────────────────────────────────────────────────────────
router.post("/:id/batches/:batchId/graduate", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batchDoc = await Batch.findOneAndUpdate(
            { institutionId, _id: req.params.batchId },
            { status: "graduated", graduationDate: new Date() },
            { new: true }
        );
        if (!batchDoc) return res.status(404).json({ error: "Batch not found" });
        res.json({ message: "Batch graduated successfully", batch: batchDoc });
    } catch (error) {
        res.status(500).json({ error: "Failed to graduate batch" });
    }
});

// ─── Delete a Batch ───────────────────────────────────────────────────────────
router.delete("/:id/batches/:batchId", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }

        const batchId = req.params.batchId;

        // 1. Delete the batch
        const batch = await Batch.findOneAndDelete({ institutionId, _id: batchId });
        if (!batch) return res.status(404).json({ error: "Batch not found" });

        // 2. Unset from students
        await User.updateMany({ institutionId, batchId }, { $unset: { batchId: "" } });

        // 3. Remove from events' targetBatches
        await Event.updateMany(
            { institutionId, targetBatches: batchId },
            { $pull: { targetBatches: batchId } }
        );

        res.json({ message: "Batch deleted successfully" });
    } catch (error) {
        console.error("Delete batch error:", error);
        res.status(500).json({ error: "Failed to delete batch." });
    }
});

// ─── Analytics Filter ─────────────────────────────────────────────────────────
router.post("/:id/analytics/filter", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { eventId, department, batchId, scoreRange, limit = 100, createdByRole, creatorDept } = req.body;

        // 1. Fetch institution departments for "each and every department" requirement
        const inst = await Institution.findById(institutionId).select('departments').lean();
        const allDepts = inst?.departments?.map(d => d.name) || [];

        const match = { college: new mongoose.Types.ObjectId(institutionId) };
        if (eventId) match.eventId = new mongoose.Types.ObjectId(eventId);

        // Flexible department matching
        if (department && department !== 'All Departments') {
            match.department = new RegExp(`^${department}$`, 'i');
        }

        const basePipeline = [
            { $match: match },
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            // Join with Event to get creator info
            {
                $lookup: {
                    from: "events",
                    localField: "eventId",
                    foreignField: "_id",
                    as: "eventInfo"
                }
            },
            { $addFields: { eventDoc: { $arrayElemAt: ["$eventInfo", 0] } } }
        ];

        // Filter by creator role (Source)
        if (createdByRole) {
            if (createdByRole === 'inst-admin') {
                // Include inst-admin, super-admin, and old admin events (no role AND no dept)
                basePipeline.push({
                    $match: {
                        $or: [
                            { "eventDoc.createdByRole": "inst-admin" },
                            { "eventDoc.createdByRole": "super-admin" },
                            {
                                $and: [
                                    { "eventDoc.createdByRole": { $exists: false } },
                                    { "eventDoc.createdByDeptName": { $exists: false } }
                                ]
                            }
                        ]
                    }
                });
            } else if (createdByRole === 'hod') {
                // Include hod role and old HOD events (no role but has dept)
                basePipeline.push({
                    $match: {
                        $or: [
                            { "eventDoc.createdByRole": "hod" },
                            {
                                $and: [
                                    { "eventDoc.createdByRole": { $exists: false } },
                                    { "eventDoc.createdByDeptName": { $exists: true, $ne: "" } }
                                ]
                            }
                        ]
                    }
                });
                // Filter by specific creator department if provided
                if (creatorDept && creatorDept !== 'All Departments' && creatorDept !== '') {
                    basePipeline.push({ $match: { "eventDoc.createdByDeptName": creatorDept } });
                }
            } else {
                basePipeline.push({ $match: { "eventDoc.createdByRole": createdByRole } });
            }
        }

        // Filter by score range
        if (scoreRange && scoreRange !== 'all') {
            if (scoreRange === 'above80') basePipeline.push({ $match: { "setResults.percentage": { $gte: 80 } } });
            else if (scoreRange === '70-80') basePipeline.push({ $match: { "setResults.percentage": { $gte: 70, $lt: 80 } } });
            else if (scoreRange === '50-70') basePipeline.push({ $match: { "setResults.percentage": { $gte: 50, $lt: 70 } } });
            else if (scoreRange === 'below50') basePipeline.push({ $match: { "setResults.percentage": { $lt: 50 } } });
        }

        if (batchId && batchId !== 'All Batches') {
            if (mongoose.Types.ObjectId.isValid(batchId)) {
                basePipeline.push({ $match: { "batchId": new mongoose.Types.ObjectId(batchId) } });
            }
        }

        const isBottom = limit.toString().startsWith("bottom");
        const numericLimit = parseInt(limit.toString().replace("bottom", "")) || 100;

        // Use Facet to get stats (unlimited) and table data (limited)
        const facetResult = await EventParticipant.aggregate([
            ...basePipeline,
            {
                $facet: {
                    stats: [
                        {
                            $group: {
                                _id: null,
                                avgScore: { $avg: "$setResults.percentage" },
                                avgTime: { $avg: "$setResults.timeTaken" },
                                count: { $sum: 1 },
                                distribution: {
                                    $push: "$setResults.percentage"
                                },
                                deptStats: {
                                    $push: {
                                        dept: "$department",
                                        score: "$setResults.percentage"
                                    }
                                }
                            }
                        }
                    ],
                    table: [
                        { $sort: { "setResults.percentage": isBottom ? 1 : -1, "setResults.timeTaken": 1 } },
                        { $limit: numericLimit }
                    ]
                }
            }
        ]);

        const stats = facetResult[0].stats[0] || { avgScore: 0, avgTime: 0, count: 0, distribution: [], deptStats: [] };
        const results = facetResult[0].table;

        // Process Table Data
        const batchIds = [...new Set(results.filter(p => p.batchId).map(p => p.batchId.toString()))];
        const batchDocs = await Batch.find({ _id: { $in: batchIds } }).select("_id batchID").lean();
        const batchNameMap = {};
        batchDocs.forEach(b => { batchNameMap[b._id.toString()] = b.batchID; });

        const participants = results.map((p, i) => {
            let bVal = "—";
            if (p.batchId) {
                const bIdStr = p.batchId.toString();
                bVal = batchNameMap[bIdStr] || bIdStr.slice(-6);
            }
            return {
                rank: i + 1,
                rollNo: p.rollNo || "N/A",
                name: `${p.firstName} ${p.lastName}`,
                dept: p.department || "General",
                batch: bVal,
                score: p.setResults.percentage + "%",
                time: Math.floor(p.setResults.timeTaken / 60) + "m " + (p.setResults.timeTaken % 60) + "s"
            };
        });

        // Calculate All-Department Performance (showing 0 for depts with no data)
        const deptAggr = {};
        stats.deptStats.forEach(s => {
            const d = s.dept || "General";
            if (!deptAggr[d]) deptAggr[d] = { sum: 0, count: 0 };
            deptAggr[d].sum += s.score;
            deptAggr[d].count += 1;
        });

        // Ensure every institution department is present
        const chartDepts = allDepts.length > 0 ? allDepts : Object.keys(deptAggr);
        if (!chartDepts.includes("General") && deptAggr["General"]) chartDepts.push("General");

        const deptPerformance = {
            labels: chartDepts,
            values: chartDepts.map(d => {
                const s = deptAggr[d];
                return s ? Number((s.sum / s.count).toFixed(2)) : 0;
            })
        };

        const scoreDistValues = [
            stats.distribution.filter(v => v < 50).length,
            stats.distribution.filter(v => v >= 50 && v < 60).length,
            stats.distribution.filter(v => v >= 60 && v < 70).length,
            stats.distribution.filter(v => v >= 70 && v < 80).length,
            stats.distribution.filter(v => v >= 80 && v < 90).length,
            stats.distribution.filter(v => v >= 90).length
        ];

        res.json({
            topPerformer: participants[0] ? {
                name: participants[0].name, rollNo: participants[0].rollNo,
                department: participants[0].dept, score: participants[0].score, rank: 1, total: stats.count
            } : null,
            averageScore: Number(stats.avgScore.toFixed(2)),
            averageTime: Math.round(stats.avgTime / 60) + "m",
            totalParticipants: stats.count,
            participants,
            chartData: {
                scoreDistribution: {
                    labels: ["0-50", "50-60", "60-70", "70-80", "80-90", "90-100"],
                    values: scoreDistValues
                },
                deptPerformance
            }
        });
    } catch (error) {
        console.error("Analytics filter error:", error);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

// ─── Generate Report ──────────────────────────────────────────────────────────
router.post("/:id/reports/generate", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { period = "30" } = req.body;

        const periodDays = period === "academic" ? 365 : parseInt(period);
        const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

        const match = { college: new mongoose.Types.ObjectId(institutionId), createdAt: { $gte: since } };

        const results = await EventParticipant.aggregate([
            { $match: match },
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } }
        ]);

        const events = await Event.find({ institutionId, createdAt: { $gte: since } });

        const eventSummary = events.map(e => {
            const eResults = results.filter(r => r.eventId.toString() === e._id.toString());
            const avg = eResults.length > 0 ? eResults.reduce((s, r) => s + r.setResults.percentage, 0) / eResults.length : 0;
            const completion = eResults.length; // Simplified
            return {
                name: e.eventName,
                category: e.category || "General",
                participants: e.participantCount || 0,
                avgScore: Math.round(avg) + "%",
                completion: completion + " submissions"
            };
        });

        // Metrics
        const totalSubmissions = results.length;
        const overallAvg = totalSubmissions > 0 ? results.reduce((s, r) => s + r.setResults.percentage, 0) / totalSubmissions : 0;

        // Department Comparison
        const depts = [...new Set(results.map(r => r.department))];
        const departmentComparison = depts.map(d => {
            const dResults = results.filter(r => r.department === d);
            const dEvents = [...new Set(dResults.map(r => r.eventId.toString()))].length;
            const avg = dResults.reduce((s, r) => s + r.setResults.percentage, 0) / dResults.length;
            return {
                dept: d || "General",
                events: dEvents,
                participants: dResults.length,
                avgScore: Math.round(avg) + "%"
            };
        });

        res.json({
            metrics: {
                totalChallenges: events.length,
                averageScore: Math.round(overallAvg),
                completionRate: totalSubmissions > 0 ? 100 : 0 // Stubbed rate
            },
            eventSummary,
            departmentComparison,
            reportMeta: `Generated for ${period} days`
        });
    } catch (error) {
        console.error("Generate report error:", error);
        res.status(500).json({ error: "Failed to generate report" });
    }
});

// ─── Email Report ─────────────────────────────────────────────────────────────
router.post("/:id/reports/email", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { email, subject, period } = req.body;
        if (!email) return res.status(400).json({ error: "Recipient email is required" });
        // Real implementation would queue an email job (nodemailer/SendGrid etc.)
        console.log(`📧 Report email queued → ${email} for institution ${institutionId}`);
        res.json({ message: `Report queued to ${email}` });
    } catch (error) {
        res.status(500).json({ error: "Failed to queue email" });
    }
});

// ─── HOD / Staff Access List ──────────────────────────────────────────────────
router.get("/:id/departments/:deptId/access", authenticate, async (req, res) => {
    try {
        const institutionId = req.params.id;
        // Fetch all HOD/staff users linked to this department
        const staff = await User.find({ institutionId, hodDepartmentId: req.params.deptId })
            .select("email username role createdAt");
        res.json({
            staff: staff.map(s => ({
                email: s.email,
                name: s.username,
                role: s.role,
                grantedAt: s.createdAt
            }))
        });
    } catch (error) {
        console.error("Fetch access list error:", error);
        res.status(500).json({ error: "Failed to fetch access list." });
    }
});

// ─── Grant HOD / Staff Access ─────────────────────────────────────────────────
router.post("/:id/departments/:deptId/grant-access", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const { email, role = "hod" } = req.body;

        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }

        if (!email) return res.status(400).json({ error: "Email is required" });

        const dept = await Department.findById(req.params.deptId);
        if (!dept) return res.status(404).json({ error: "Department not found" });

        // Upsert user record with HOD role linked to dept
        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            {
                $set: { role, hodDepartmentId: req.params.deptId, institutionId: dept.institutionId },
                $setOnInsert: { email: email.toLowerCase(), isPasswordSet: false }
            },
            { upsert: true, new: true }
        );

        // SYNC: Update Department with HOD info if role is hod
        if (role === "hod") {
            await Department.findByIdAndUpdate(req.params.deptId, {
                hodName: user.username,
                hodEmail: user.email
            });
        }

        res.json({ message: "Access granted", user: { email: user.email, role: user.role } });
    } catch (error) {
        console.error("Grant access error:", error);
        res.status(500).json({ error: "Failed to grant access." });
    }
});

// ─── Set HOD Password ────────────────────────────────────────────────────────
router.post("/:id/departments/:deptId/set-password", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const { email, password } = req.body;

        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }

        if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

        const dept = await Department.findById(req.params.deptId);
        if (!dept) return res.status(404).json({ error: "Department not found" });

        // 1. Check if user already exists in Firebase
        let firebaseUser;
        try {
            firebaseUser = await admin.auth().getUserByEmail(email);
            // 2. Update password for existing user
            await admin.auth().updateUser(firebaseUser.uid, { password });
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // 3. Create new user in Firebase
                firebaseUser = await admin.auth().createUser({
                    email,
                    password,
                    displayName: email.split('@')[0]
                });
            } else {
                throw error;
            }
        }

        // 2. Upsert user record
        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            {
                $set: {
                    firebaseUid: firebaseUser.uid,
                    role: "hod",
                    hodDepartmentId: req.params.deptId,
                    institutionId: dept.institutionId,
                    isPasswordSet: true
                }
            },
            { upsert: true, new: true }
        );

        // SYNC: Update Department with HOD info
        await Department.findByIdAndUpdate(req.params.deptId, {
            hodUID: firebaseUser.uid,
            hodEmail: user.email,
            hodName: user.username
        });

        res.json({ message: "Password updated successfully", email: user.email });
    } catch (error) {
        console.error("Set password error:", error);
        res.status(500).json({ error: "Failed to set password." });
    }
});

// ─── Revoke HOD / Staff Access ────────────────────────────────────────────────
router.delete("/:id/departments/:deptId/revoke-access", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.params.id;
        const { email } = req.body;

        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized for this institution" });
        }

        // 1. Update User record
        await User.findOneAndUpdate(
            { email: email.toLowerCase(), hodDepartmentId: req.params.deptId },
            { $unset: { hodDepartmentId: "", role: "" }, $set: { role: "student" } }
        );

        // 2. Clear HOD info from Department if it matches
        const dept = await Department.findById(req.params.deptId);
        if (dept && dept.hodEmail && dept.hodEmail.toLowerCase() === email.toLowerCase()) {
            await Department.findByIdAndUpdate(req.params.deptId, {
                $unset: { hodUID: "", hodName: "", hodEmail: "", hodPhone: "" }
            });
        }

        res.json({ message: "Access revoked" });
    } catch (error) {
        console.error("Revoke access error:", error);
        res.status(500).json({ error: "Failed to revoke access." });
    }
});



// ─── Get Students ────────────────────────────────────────────────────────────
router.get("/:id/students", authenticate, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user || (user.institutionId.toString() !== req.params.id && user.role !== "super-admin" && user.role !== "hod")) {
            return res.status(403).json({ error: "Access denied" });
        }
        const { department, batchId, search } = req.query;
        const query = { institutionId: req.params.id, role: "student" };
        if (department) {
            // Find department to get both name and code if possible
            const deptDoc = await Department.findOne({
                institutionId: req.params.id,
                $or: [{ name: department }, { code: department }]
            });
            if (deptDoc) {
                const nameRegex = new RegExp(`^${deptDoc.name.trim().replace(/\s+/g, '\\s+')}$`, "i");
                const codeRegex = new RegExp(`^${deptDoc.code.trim().replace(/\s+/g, '\\s+')}$`, "i");
                query.department = { $in: [nameRegex, codeRegex] };
            } else {
                query.department = new RegExp(`^${department.trim().replace(/\s+/g, '\\s+')}$`, "i");
            }
        }
        if (batchId) query.batchId = batchId;
        if (search) query.$or = [
            { username: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
            { rollNumber: new RegExp(search, "i") }
        ];
        const students = await User.find(query)
            .populate("batchId", "batchID")
            .select("username email rollNumber department createdAt");
        res.json({ students });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch students" });
    }
});

// ─── Add Student ─────────────────────────────────────────────────────────────
router.post("/:id/students", instAdminOnly, async (req, res) => {
    try {
        const { rollNumber, username, email, department, batchId, role } = req.body;
        const instId = req.params.id;

        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== instId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // Resolve batchId if given as string ID
        let resolvedBatchId = batchId;
        if (batchId && batchId.length !== 24) {
            const batchDoc = await Batch.findOne({ institutionId: instId, batchID: batchId });
            if (batchDoc) resolvedBatchId = batchDoc._id;
        }

        const student = new User({
            firebaseUid: `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            rollNumber, username, email, department,
            batchId: resolvedBatchId, role: role || "student",
            institutionId: instId
        });
        await student.save();
        res.status(201).json({ student });
    } catch (error) {
        console.error("Add student error:", error);
        res.status(500).json({ error: "Failed to add student." });
    }
});

// ─── Bulk Add Students ───────────────────────────────────────────────────────
router.post("/:id/students/bulk", instAdminOnly, async (req, res) => {
    try {
        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { students } = req.body;

        // Resolve batchIDs to ObjectIds
        const batches = await Batch.find({ institutionId: req.params.id }).select("_id batchID").lean();
        const batchMap = {};
        batches.forEach(b => {
            batchMap[b.batchID] = b._id;
            batchMap[b._id.toString()] = b._id;
        });

        const processedStudents = students.map(s => {
            const rawBatch = s.batchId || s.batchID;
            return {
                username: s.name || s.username,
                email: s.email,
                rollNumber: s.rollNumber || s.rollNo,
                department: s.department,
                batchId: batchMap[rawBatch] || null, // Resolve to ObjectId if possible
                role: "student",
                firebaseUid: s.firebaseUid || `imported-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                institutionId: req.params.id
            };
        });
        const created = await User.insertMany(processedStudents);
        res.status(201).json({ count: created.length, students: created });
    } catch (error) {
        res.status(500).json({ error: "Bulk import failed" });
    }
});

// ─── Delete Student ──────────────────────────────────────────────────────────
router.delete("/:id/students/:studentId", instAdminOnly, async (req, res) => {
    try {
        if (!req.instAdmin.institutionId || req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized" });
        }
        await User.findByIdAndDelete(req.params.studentId);
        res.json({ message: "Student deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete student" });
    }
});

module.exports = router;
