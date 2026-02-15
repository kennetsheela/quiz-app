//institutionRoutes.js
const express = require("express");
const router = express.Router();
const Institution = require("../models/Institution");
const Department = require("../models/Department");
const Batch = require("../models/Batch");
const User = require("../models/User");
const Event = require("../models/Event");
const { verifyToken } = require("./authRoutes");

// Create new institution (Onboarding)
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, type, email, phone, location, academicConfig } = req.body;

        // Check if institution already registered by this admin
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
            subscription: { plan: "free", status: "active" }, // Default to free
            academicConfig
        });

        res.status(201).json({ message: "Institution registered successfully", institution: inst });
    } catch (error) {
        console.error("Institution registration error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get institution details
router.get("/my", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });
        if (!inst) {
            return res.status(404).json({ error: "Institution not found" });
        }
        res.json(inst);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manage Departments
router.post("/departments", verifyToken, async (req, res) => {
    try {
        const { name, code } = req.body;
        const inst = await Institution.findOne({ adminUID: req.user.uid });

        if (!inst) return res.status(404).json({ error: "Institution not found" });

        const dept = await Department.create({
            name,
            code,
            institutionId: inst._id
        });

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

// Login endpoint - Check if institution exists for authenticated user
router.post("/login", verifyToken, async (req, res) => {
    try {
        const inst = await Institution.findOne({ adminUID: req.user.uid });

        if (!inst) {
            return res.status(404).json({
                error: "No institution found for this account",
                needsSetup: true
            });
        }

        res.json({
            message: "Login successful",
            institution: inst
        });
    } catch (error) {
        console.error("Institution login error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Public Registration (no auth required)
router.post("/register", async (req, res) => {
    try {
        const { name, type, adminUID, email, phone, location, subscription } = req.body;
        const existing = await Institution.findOne({ $or: [{ email }, { name }] });
        if (existing) {
            return res.status(400).json({ error: "Institution already registered" });
        }
        const institution = new Institution({ name, type, adminUID, email, phone, location, subscription });
        await institution.save();
        const adminUser = new User({ firebaseUid: adminUID, email, username: name, role: "inst-admin", institutionId: institution._id });
        await adminUser.save();
        res.status(201).json({ message: "Institution registered successfully", institution });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// Update Academic Configuration
router.put("/:id/config", async (req, res) => {
    try {
        const { academicConfig } = req.body;
        const institution = await Institution.findByIdAndUpdate(req.params.id, { academicConfig }, { new: true });
        res.json({ institution });
    } catch (error) {
        res.status(500).json({ error: "Config update failed" });
    }
});

// Add Department (public for setup wizard)
router.post("/:id/departments", async (req, res) => {
    try {
        const { name, code, hodName, hodEmail, hodPhone } = req.body;
        const department = new Department({ institutionId: req.params.id, name, code, hodName, hodEmail, hodPhone });
        await department.save();
        res.status(201).json({ department });
    } catch (error) {
        res.status(500).json({ error: "Failed to add department" });
    }
});

// Get Departments by Institution ID
router.get("/:id/departments", async (req, res) => {
    try {
        const departments = await Department.find({ institutionId: req.params.id });
        res.json({ departments });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

// Add Batch
router.post("/:id/batches", async (req, res) => {
    try {
        const { departmentId, name, year, graduationDate } = req.body;
        const batch = new Batch({ institutionId: req.params.id, departmentId, name, year, graduationDate, status: "active" });
        await batch.save();
        res.status(201).json({ batch });
    } catch (error) {
        res.status(500).json({ error: "Failed to add batch" });
    }
});

// Get Batches
router.get("/:id/batches", async (req, res) => {
    try {
        const batches = await Batch.find({ institutionId: req.params.id }).populate("departmentId", "name code");
        res.json({ batches });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch batches" });
    }
});

// Get Institution Dashboard Stats
router.get("/:id/dashboard", async (req, res) => {
    try {
        const institutionId = req.params.id;
        const [totalDepartments, totalBatches, totalStudents, totalEvents, activeBatches] = await Promise.all([
            Department.countDocuments({ institutionId }),
            Batch.countDocuments({ institutionId }),
            User.countDocuments({ institutionId, role: "student" }),
            Event.countDocuments({ institutionId }),
            Batch.countDocuments({ institutionId, status: "active" })
        ]);
        const recentEvents = await Event.find({ institutionId }).sort({ createdAt: -1 }).limit(5).select("title startDate status participantCount");
        res.json({ stats: { totalDepartments, totalBatches, totalStudents, totalEvents, activeBatches }, recentEvents });
    } catch (error) {
        res.status(500).json({ error: "Failed to load dashboard" });
    }
});

// Get Students
router.get("/:id/students", async (req, res) => {
    try {
        const { department, batch, search } = req.query;
        const query = { institutionId: req.params.id, role: "student" };
        if (department) query.department = department;
        if (batch) query.batchId = batch;
        if (search) query.$or = [{ username: new RegExp(search, "i") }, { email: new RegExp(search, "i") }, { rollNumber: new RegExp(search, "i") }];
        const students = await User.find(query).populate("batchId", "name year").select("username email rollNumber department createdAt");
        res.json({ students });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch students" });
    }
});

// Add Student
router.post("/:id/students", async (req, res) => {
    try {
        const { rollNumber, username, email, department, batchId, role } = req.body;
        const student = new User({ firebaseUid: `temp-${Date.now()}`, rollNumber, username, email, department, batchId, role: role || "student", institutionId: req.params.id });
        await student.save();
        res.status(201).json({ student });
    } catch (error) {
        res.status(500).json({ error: "Failed to add student" });
    }
});

// Bulk Add Students
router.post("/:id/students/bulk", async (req, res) => {
    try {
        const { students } = req.body;
        const created = await User.insertMany(students.map(s => ({ ...s, firebaseUid: `temp-${Date.now()}-${Math.random()}` })));
        res.status(201).json({ count: created.length, students: created });
    } catch (error) {
        res.status(500).json({ error: "Bulk import failed" });
    }
});

// Delete Student
router.delete("/:id/students/:studentId", async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.studentId);
        res.json({ message: "Student deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete student" });
    }
});

module.exports = router;
