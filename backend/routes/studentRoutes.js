//studentRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("./authRoutes");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const Event = require("../models/Event");
const Batch = require("../models/Batch");
const Institution = require("../models/Institution");

// POST /api/students/login - Institution or independent student login
router.post("/login", verifyToken, async (req, res) => {
    try {
        const { institutionId, batchId, department, rollNumber, name, email, country, ageRange } = req.body;

        let user = await User.findOne({ firebaseUid: req.user.uid });

        if (!user) {
            // Create new user
            const userData = {
                firebaseUid: req.user.uid,
                email: email || req.user.email,
                username: name,
                role: institutionId ? "student" : "independent"
            };

            if (institutionId) {
                // Institution student
                userData.institutionId = institutionId;
                userData.batchId = batchId;
                userData.department = department;
                userData.rollNumber = rollNumber;

                // Validate batch is not graduated
                const batch = await Batch.findById(batchId);
                if (!batch) {
                    return res.status(404).json({ error: "Batch not found" });
                }
                if (batch.status === "graduated") {
                    return res.status(403).json({
                        error: "Cannot login. Your batch has graduated.",
                        isGraduated: true
                    });
                }
            } else {
                // Independent student
                userData.country = country;
                userData.ageRange = ageRange;
            }

            user = new User(userData);
            await user.save();

            // Create student profile
            const profile = new StudentProfile({
                userId: user._id,
                institutionId: institutionId || null,
                batchId: batchId || null,
                department: department || null
            });
            await profile.save();
        } else {
            // Update last login
            user.lastLogin = Date.now();
            await user.save();

            // For institution students, check batch status
            if (user.institutionId && user.batchId) {
                const batch = await Batch.findById(user.batchId);
                if (batch && batch.status === "graduated") {
                    return res.status(403).json({
                        error: "Cannot login. Your batch has graduated.",
                        isGraduated: true
                    });
                }
            }
        }

        res.json({
            message: "Login successful",
            user,
            isInstitutionStudent: !!user.institutionId
        });
    } catch (error) {
        console.error("Student login error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/students/profile - Student profile & stats
router.get("/profile", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid })
            .populate("institutionId")
            .populate("batchId");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const profile = await StudentProfile.findOne({ userId: user._id });

        res.json({ user, profile });
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/students/events/available - Filter by institution/public
router.get("/events/available", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const filter = {
            startTime: { $lte: new Date() },
            endTime: { $gte: new Date() }
        };

        if (user.institutionId) {
            // Institution student: can see public + institution events
            filter.$or = [
                { visibility: "public" },
                { institutionId: user.institutionId }
            ];
        } else {
            // Independent student: only public events
            filter.visibility = "public";
        }

        const events = await Event.find(filter).sort({ startTime: -1 });

        res.json({ events });
    } catch (error) {
        console.error("Get available events error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/students/progress/year-wise - Year-wise performance
router.get("/progress/year-wise", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const profile = await StudentProfile.findOne({ userId: user._id });

        if (!profile) {
            return res.status(404).json({ error: "Profile not found" });
        }

        res.json({ yearWisePerformance: profile.yearWisePerformance });
    } catch (error) {
        console.error("Get year-wise progress error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/students/rankings - Department/batch rankings
router.get("/rankings", verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.user.uid });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const profile = await StudentProfile.findOne({ userId: user._id });

        if (!profile) {
            return res.status(404).json({ error: "Profile not found" });
        }

        res.json({ rankings: profile.rankings });
    } catch (error) {
        console.error("Get rankings error:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
