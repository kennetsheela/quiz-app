//institutionRoutes.js
const express = require("express");
const router = express.Router();
const Institution = require("../models/Institution");
const Department = require("../models/Department");
const Batch = require("../models/Batch");
const User = require("../models/User");
const Event = require("../models/Event");
const { verifyToken, verifyInstAdmin } = require("./authRoutes");

// ─── Helper: get ordinal year label ─────────────────────────────────────────
function ordinalYear(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Create new institution (Onboarding) ────────────────────────────────────
router.post("/", verifyToken, async (req, res) => {
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

        res.status(201).json({ message: "Institution registered successfully", institution: inst });
    } catch (error) {
        console.error("Institution registration error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Get institution details ─────────────────────────────────────────────────
// BUG FIX: was returning raw `inst`, now wrapped in { institution }
// so frontend's data.institution works correctly
router.get("/my", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) {
            return res.status(404).json({ error: "Institution not found" });
        }
        res.json({ institution: inst }); // ← FIXED: was res.json(inst)
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Manage Departments ──────────────────────────────────────────────────────
router.post("/departments", verifyToken, async (req, res) => {
    try {
        const { name, code } = req.body;
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) return res.status(404).json({ error: "Institution not found" });

        const dept = await Department.create({ name, code, institutionId: inst._id });
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

// ─── Bulk Setup: departments, batches, HODs ──────────────────────────────────
// BUG FIX: HOD upsert now correctly handles missing firebaseUid
// using $setOnInsert so existing docs are never overwritten with null
router.post("/setup", verifyToken, async (req, res) => {
    try {
        const { departments, batches, hods } = req.body;
        const inst = await Institution.findOne({ adminUID: req.user.uid });

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
                    { ...batchData, institutionId: inst._id },
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
        res.status(500).json({ error: error.message });
    }
});

// ─── Login endpoint ──────────────────────────────────────────────────────────
router.post("/login", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) {
            return res.status(404).json({ error: "No institution found for this account", needsSetup: true });
        }
        res.json({ message: "Login successful", institution: inst });
    } catch (error) {
        console.error("Institution login error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Public Registration (no auth required) ──────────────────────────────────
// BUG FIX: guard against missing adminUID before creating User
router.post("/register", async (req, res) => {
    try {
        const { name, type, adminUID, email, phone, location, subscription } = req.body;

        // Guard: adminUID is required here since there's no auth middleware
        if (!adminUID) {
            return res.status(400).json({ error: "adminUID is required for registration" });
        }

        const existing = await Institution.findOne({ $or: [{ email }, { name }] });
        if (existing) {
            return res.status(400).json({ error: "Institution already registered" });
        }

        const institution = new Institution({ name, type, adminUID, email, phone, location, subscription });
        await institution.save();

        const adminUser = new User({
            firebaseUid: adminUID, // safe — adminUID is validated above
            email,
            username: name,
            role: "inst-admin",
            institutionId: institution._id
        });
        await adminUser.save();

        res.status(201).json({ message: "Institution registered successfully", institution });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed: " + error.message });
    }
});

// ─── Update Academic Configuration ──────────────────────────────────────────
router.put("/:id/config", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const { academicConfig } = req.body;
        if (req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized to manage this institution" });
        }
        const institution = await Institution.findByIdAndUpdate(req.params.id, { academicConfig }, { new: true });
        res.json({ institution });
    } catch (error) {
        res.status(500).json({ error: "Config update failed" });
    }
});

// ─── Add Department (inst admin only) ───────────────────────────────────────
router.post("/:id/departments", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const { name, code, hodName, hodEmail, hodPhone } = req.body;
        if (req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized to manage this institution" });
        }
        const department = new Department({ institutionId: req.params.id, name, code, hodName, hodEmail, hodPhone });
        await department.save();
        res.status(201).json({ department });
    } catch (error) {
        res.status(500).json({ error: "Failed to add department" });
    }
});

// ─── Get Departments by Institution ID ──────────────────────────────────────
router.get("/:id/departments", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user || (user.institutionId.toString() !== req.params.id && user.role !== "super-admin")) {
            return res.status(403).json({ error: "Access denied" });
        }
        const departments = await Department.find({ institutionId: req.params.id });
        res.json({ departments });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

// ─── Add Batch ───────────────────────────────────────────────────────────────
router.post("/:id/batches", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const { departmentId, name, year, graduationDate } = req.body;
        if (req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batch = new Batch({ institutionId: req.params.id, departmentId, name, year, graduationDate, status: "active" });
        await batch.save();
        res.status(201).json({ batch });
    } catch (error) {
        res.status(500).json({ error: "Failed to add batch" });
    }
});

// ─── Get Batches ─────────────────────────────────────────────────────────────
router.get("/:id/batches", verifyToken, async (req, res) => {
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
router.get("/:id/dashboard", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const [totalEvents, completedEvents, activeEventCount] = await Promise.all([
            Event.countDocuments({ institutionId }),
            Event.countDocuments({ institutionId, status: "completed" }),
            Event.countDocuments({ institutionId, status: "active" })
        ]);

        // average score: pull from event participation data (stub — returns 0 if no data)
        const activeEventDocs = await Event.find({ institutionId, status: { $in: ["active", "pending"] } })
            .sort({ startTime: -1 })
            .limit(5)
            .select("eventName startTime status participantCount category visibility");

        res.json({
            metrics: {
                totalEvents,
                completedEvents,
                averageScore: 0,   // real implementation would aggregate quiz results
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
router.get("/:id/events", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { status, type, category, search } = req.query;
        const query = { institutionId };
        if (status) query.status = status.toLowerCase();
        if (category) query.category = new RegExp(category, "i");
        if (type) query.isPublic = (type.toLowerCase() === "public");
        if (search) query.eventName = new RegExp(search, "i");

        const events = await Event.find(query).sort({ createdAt: -1 }).select(
            "eventName category visibility isPublic startTime status participantCount createdAt"
        );
        res.json({
            events: events.map(e => ({
                _id: e._id,
                name: e.eventName,
                category: e.category || "General",
                type: (e.visibility === "public" || e.isPublic) ? "Public" : "Private",
                start: e.startTime,
                participants: e.participantCount || 0,
                status: e.status || "Pending"
            }))
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

// ─── Create Event ─────────────────────────────────────────────────────────────
router.post("/:id/events", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const {
            name, category, type, start, end, duration, description,
            targetDepts, targetBatches, maxParticipants, registrationDeadline,
            visibility, questionMethod, numQuestions, marksPerQ, negativeMarking,
            difficulty, questionOrder, allowRevisit, proctoring
        } = req.body;

        if (!name || !start || !end) {
            return res.status(400).json({ error: "name, start, and end are required" });
        }

        const event = new Event({
            eventName: name,
            category: category || "General",
            visibility: visibility || "institution",
            isPublic: (type === "Public"),
            startTime: new Date(start),
            endTime: new Date(end),
            institutionId,
            targetDepartments: targetDepts || [],
            targetBatches: targetBatches || [],
            createdBy: req.user.uid,
            createdByRole: "inst-admin",
            adminPassword: Math.random().toString(36).slice(-8),
            studentPassword: Math.random().toString(36).slice(-6),
            proctoringConfig: proctoring ? {
                fullscreen: proctoring.fullscreen,
                tabSwitch: proctoring.tabLock,
                webcam: proctoring.faceRecognition,
                randomizeQuestions: proctoring.randomizeQ,
                randomizeOptions: true
            } : undefined
        });
        await event.save();
        res.status(201).json({
            event: {
                _id: event._id, name: event.eventName,
                category: event.category, status: "Pending",
                start: event.startTime, participants: 0
            }
        });
    } catch (error) {
        console.error("Create event error:", error);
        res.status(500).json({ error: error.message || "Failed to create event" });
    }
});

// ─── Student Stats ────────────────────────────────────────────────────────────
router.get("/:id/students/stats", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const [total, active] = await Promise.all([
            User.countDocuments({ institutionId, role: "student" }),
            User.countDocuments({ institutionId, role: "student", status: { $ne: "alumni" } })
        ]);

        // Dept-wise counts
        const deptAgg = await User.aggregate([
            { $match: { institutionId: require("mongoose").Types.ObjectId(institutionId), role: "student" } },
            { $group: { _id: "$department", total: { $sum: 1 } } }
        ]);
        const perDepartment = {};
        deptAgg.forEach(d => { if (d._id) perDepartment[d._id] = { total: d.total }; });

        // Batch-wise counts
        const batchAgg = await User.aggregate([
            { $match: { institutionId: require("mongoose").Types.ObjectId(institutionId), role: "student" } },
            { $group: { _id: "$batchId", total: { $sum: 1 } } }
        ]);
        const perBatch = {};
        batchAgg.forEach(b => { if (b._id) perBatch[b._id] = { total: b.total }; });

        res.json({ total, active, alumni: total - active, perDepartment, perBatch });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch student stats" });
    }
});

// ─── Active Batches ──────────────────────────────────────────────────────────
router.get("/:id/batches/active", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batches = await Batch.find({ institutionId, status: "active" }).sort({ startYear: -1 });
        res.json({ batches });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch active batches" });
    }
});

// ─── Graduated Batches ────────────────────────────────────────────────────────
router.get("/:id/batches/graduated", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batches = await Batch.find({ institutionId, status: { $in: ["graduated", "alumni"] } }).sort({ endYear: -1 });
        res.json({ batches });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch graduated batches" });
    }
});

// ─── Batch Detail with Progression ──────────────────────────────────────────
router.get("/:id/batches/:batchId/details", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batch = await Batch.findOne({ institutionId, _id: req.params.batchId });
        if (!batch) return res.status(404).json({ error: "Batch not found" });

        const currentCalYear = new Date().getFullYear();
        const years = [];
        for (let y = batch.startYear; y <= batch.endYear; y++) years.push(y);

        const currentYear = Math.min(currentCalYear, batch.endYear);
        const yearLevel = currentYear - batch.startYear + 1;
        const yearLabel = ordinalYear(Math.max(1, Math.min(yearLevel, years.length)));

        // dept distribution
        const deptAgg = await User.aggregate([
            { $match: { institutionId: require("mongoose").Types.ObjectId(institutionId), role: "student", batchId: batch._id } },
            { $group: { _id: "$department", count: { $sum: 1 } } }
        ]);
        const deptDistribution = {};
        deptAgg.forEach(d => { if (d._id) deptDistribution[d._id] = d.count; });

        const studentCount = batch.statistics?.totalStudents || Object.values(deptDistribution).reduce((s, v) => s + v, 0);

        // Build performance progression from statistics (stub — real app would aggregate event scores)
        const perf = [];
        for (let i = 1; i <= Math.min(yearLevel, years.length); i++) {
            const isCurrent = i === yearLevel;
            perf.push({
                yr: `${ordinalYear(i)} Year${isCurrent ? ' (Now)' : ''}`,
                avg: batch.statistics?.averageScore ? `${batch.statistics.averageScore.toFixed(1)}%` : 'N/A',
                change: i === 1 ? null : null
            });
        }

        res.json({
            batchId: batch.batchID,
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
router.post("/:id/batches/:batchId/graduate", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const batch = await Batch.findOneAndUpdate(
            { institutionId, _id: req.params.batchId },
            { status: "graduated", graduationDate: new Date() },
            { new: true }
        );
        if (!batch) return res.status(404).json({ error: "Batch not found" });
        res.json({ message: "Batch graduated successfully", batch });
    } catch (error) {
        res.status(500).json({ error: "Failed to graduate batch" });
    }
});

// ─── Analytics Filter ─────────────────────────────────────────────────────────
router.post("/:id/analytics/filter", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { eventId, department, batch, scoreRange, limit = 100, order = "top" } = req.body;

        // Build student query for filtering
        const stuQuery = { institutionId: require("mongoose").Types.ObjectId(institutionId), role: "student" };
        if (department) stuQuery.department = department;
        if (batch) stuQuery.batchId = batch;

        const students = await User.find(stuQuery)
            .select("username rollNumber department batchId")
            .limit(parseInt(limit));

        // Stub: return structured response — real implementation would aggregate quiz submissions
        const participants = students.map((s, i) => ({
            rank: i + 1,
            rollNo: s.rollNumber || `STU${i + 1}`,
            name: s.username,
            dept: s.department || "—",
            batch: s.batchId ? s.batchId.toString().slice(-6) : "—",
            score: "N/A",
            time: "N/A"
        }));

        const topPerformer = participants[0] ? {
            name: participants[0].name, rollNo: participants[0].rollNo,
            department: participants[0].dept, score: "N/A", time: "N/A", rank: 1, total: participants.length
        } : null;

        res.json({
            topPerformer,
            averageScore: 0,
            averageTime: "N/A",
            totalParticipants: participants.length,
            fastFinishers: participants.slice(0, 10),
            participants,
            chartData: {
                scoreDistribution: { labels: ["0-50", "50-60", "60-70", "70-80", "80-90", "90-100"], values: [0, 0, 0, 0, 0, 0] },
                deptPerformance: { labels: [], values: [] },
                timeDistribution: { labels: ["<15m", "15-20m", "20-25m", "25-30m", "30-35m", ">35m"], values: [0, 0, 0, 0, 0, 0] }
            }
        });
    } catch (error) {
        console.error("Analytics filter error:", error);
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});

// ─── Generate Report ──────────────────────────────────────────────────────────
router.post("/:id/reports/generate", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const institutionId = req.params.id;
        if (req.instAdmin.institutionId.toString() !== institutionId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { period = "30", categories = [], department, batch, eventTypes = [] } = req.body;

        // Date range
        const periodDays = period === "academic" ? 365 : parseInt(period);
        const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

        const evtQuery = { institutionId, createdAt: { $gte: since } };
        const [events, totalStudents] = await Promise.all([
            Event.find(evtQuery).select("eventName category visibility participantCount createdAt"),
            User.countDocuments({ institutionId, role: "student" })
        ]);

        const depts = await Department.find({ institutionId }).select("name code statistics");

        const eventSummary = events.map(e => ({
            name: e.eventName,
            category: e.category || "General",
            participants: e.participantCount || 0,
            avgScore: "N/A",
            completion: "N/A"
        }));

        const departmentComparison = depts.map(d => ({
            dept: d.code,
            events: events.length,
            participants: d.statistics?.totalStudents || 0,
            avgScore: d.statistics?.averageScore ? `${d.statistics.averageScore.toFixed(1)}%` : "N/A",
            trend: "N/A"
        }));

        res.json({
            metrics: {
                totalChallenges: events.length,
                averageScore: 0,
                completionRate: 0
            },
            eventSummary,
            departmentComparison,
            chartData: {
                categoryPerformance: {
                    labels: [...new Set(events.map(e => e.category || "General"))],
                    values: [...new Set(events.map(e => e.category || "General"))].map(() => 0)
                },
                departmentTrend: {
                    labels: [],
                    datasets: depts.map(d => ({ label: d.code, data: [] }))
                }
            }
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate report" });
    }
});

// ─── Email Report ─────────────────────────────────────────────────────────────
router.post("/:id/reports/email", verifyToken, verifyInstAdmin, async (req, res) => {
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
router.get("/departments/:deptId/access", verifyToken, async (req, res) => {
    try {
        // Fetch all HOD/staff users linked to this department
        const staff = await User.find({ hodDepartmentId: req.params.deptId })
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
        res.status(500).json({ error: "Failed to fetch access list" });
    }
});

// ─── Grant HOD / Staff Access ─────────────────────────────────────────────────
router.post("/departments/:deptId/grant-access", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const { email, role = "hod" } = req.body;
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
        res.json({ message: "Access granted", user: { email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: "Failed to grant access" });
    }
});

// ─── Revoke HOD / Staff Access ────────────────────────────────────────────────
router.delete("/departments/:deptId/revoke-access", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });
        await User.findOneAndUpdate(
            { email: email.toLowerCase(), hodDepartmentId: req.params.deptId },
            { $unset: { hodDepartmentId: "", role: "" }, $set: { role: "student" } }
        );
        res.json({ message: "Access revoked" });
    } catch (error) {
        res.status(500).json({ error: "Failed to revoke access" });
    }
});



// ─── Get Students ────────────────────────────────────────────────────────────
router.get("/:id/students", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });
        if (!user || (user.institutionId.toString() !== req.params.id && user.role !== "super-admin" && user.role !== "hod")) {
            return res.status(403).json({ error: "Access denied" });
        }
        const { department, batch, search } = req.query;
        const query = { institutionId: req.params.id, role: "student" };
        if (department) query.department = department;
        if (batch) query.batchId = batch;
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
router.post("/:id/students", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        const { rollNumber, username, email, department, batchId, role } = req.body;
        if (req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const student = new User({
            firebaseUid: `temp-${Date.now()}`, // temporary until student logs in
            rollNumber, username, email, department,
            batchId, role: role || "student",
            institutionId: req.params.id
        });
        await student.save();
        res.status(201).json({ student });
    } catch (error) {
        res.status(500).json({ error: "Failed to add student" });
    }
});

// ─── Bulk Add Students ───────────────────────────────────────────────────────
router.post("/:id/students/bulk", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        if (req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const { students } = req.body;
        const created = await User.insertMany(
            students.map(s => ({
                ...s,
                firebaseUid: `temp-${Date.now()}-${Math.random()}`,
                institutionId: req.params.id
            }))
        );
        res.status(201).json({ count: created.length, students: created });
    } catch (error) {
        res.status(500).json({ error: "Bulk import failed" });
    }
});

// ─── Delete Student ──────────────────────────────────────────────────────────
router.delete("/:id/students/:studentId", verifyToken, verifyInstAdmin, async (req, res) => {
    try {
        if (req.instAdmin.institutionId.toString() !== req.params.id) {
            return res.status(403).json({ error: "Not authorized" });
        }
        await User.findByIdAndDelete(req.params.studentId);
        res.json({ message: "Student deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete student" });
    }
});

module.exports = router;