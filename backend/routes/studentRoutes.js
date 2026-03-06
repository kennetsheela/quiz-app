//studentRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, allowRoles, isolateInstitution } = require("../middleware/authMiddleware");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");
const Batch = require("../models/Batch");
const Institution = require("../models/Institution");

// POST /api/students/login - Institution or independent student login
router.post("/login", authenticate, async (req, res) => {
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
                const batchDoc = await Batch.findById(batchId);
                if (!batchDoc) {
                    return res.status(404).json({ error: "Batch not found" });
                }
                if (batchDoc.status === "graduated") {
                    return res.status(403).json({
                        error: "Cannot login. Your batch cohort has graduated.",
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
                const batchDoc = await Batch.findById(user.batchId);
                if (batchDoc && batchDoc.status === "graduated") {
                    return res.status(403).json({
                        error: "Cannot login. Your batch cohort has graduated.",
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

// GET /api/students/profile - Student profile & stats (Computed Real-time)
router.get("/profile", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .populate("institutionId")
            .populate("batchId");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // 1. Fetch real-time participation data for this student
        const participations = await EventParticipant.find({ userId: user.firebaseUid }).populate({
            path: 'eventId',
            select: 'eventName category sets proctoringConfig'
        });

        // 2. Compute basic stats and analytics
        let totalEventsAttended = 0;
        let totalScorePercentSum = 0;
        let bestScore = 0;
        let totalSetsCompleted = 0;

        const categoryStats = {};
        // Topic stats map: { "Topic Name": { totalCorrect: X, totalQs: Y, avg: Z } }
        const topicStats = {};

        for (const p of participations) {
            if (!p.eventId) continue;
            totalEventsAttended++;

            const category = p.eventId.category || "General";
            if (!categoryStats[category]) {
                categoryStats[category] = { totalPct: 0, count: 0, avg: 0 };
            }

            for (const r of p.setResults) {
                if (r.completedAt) {
                    const pct = r.percentage || 0;
                    totalScorePercentSum += pct;
                    totalSetsCompleted++;
                    if (pct > bestScore) bestScore = pct;

                    categoryStats[category].totalPct += pct;
                    categoryStats[category].count++;
                }
            }
        }

        // Finalize category averages
        Object.keys(categoryStats).forEach(cat => {
            if (categoryStats[cat].count > 0) {
                categoryStats[cat].avg = Math.round(categoryStats[cat].totalPct / categoryStats[cat].count);
            }
        });

        const overallAverage = totalSetsCompleted > 0 ? (totalScorePercentSum / totalSetsCompleted) : 0;

        // 3. Compute Global Rank based on Average Score
        // Get count of users with higher average score than current user
        const betterAgg = await EventParticipant.aggregate([
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            {
                $group: {
                    _id: "$userId",
                    userAvg: { $avg: "$setResults.percentage" }
                }
            },
            { $match: { userAvg: { $gt: overallAverage } } },
            { $count: "betterCount" }
        ]);

        const betterCount = betterAgg.length > 0 ? betterAgg[0].betterCount : 0;
        const globalRank = betterCount + 1;

        // 4. Update the StudentProfile document in background for historical tracking/caching
        // We use findOneAndUpdate to ensure we either update or create the profile
        StudentProfile.findOneAndUpdate(
            { userId: user._id },
            {
                $set: {
                    totalEventsAttended,
                    overallAverage: Math.round(overallAverage),
                    bestScore: Math.round(bestScore),
                    "rankings.institutionRank": globalRank,
                    "rankings.lastUpdated": new Date(),
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true }
        ).catch(err => console.error("Error updating student profile in background:", err));

        // Simplified Profile Object for Dashboard
        const profileInfo = {
            totalEventsAttended,
            overallAverage: Math.round(overallAverage),
            bestScore: Math.round(bestScore),
            rankings: {
                globalRank,
                institutionRank: globalRank // Fallback
            },
            categoryStats,
            // Topic stats could be added here if we had detailed question-level tracking
        };

        res.json({ user, profile: profileInfo });
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/students/events/available - Filter by institution/public
router.get("/events/available", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const now = new Date();
        const filter = {
            // startTime: { $lte: now }, // REMOVED: Allow seeing upcoming events
            endTime: { $gte: now },
            status: "Active"
        };

        if (user.institutionId) {
            // Institution student: can see public + their own institution's targeted events
            filter.$or = [
                { visibility: "public" },
                { isPublic: true }, // ADDED: Fallback for older events
                {
                    institutionId: user.institutionId,
                    $and: [
                        {
                            $or: [
                                { targetDepartments: { $exists: false } },
                                { targetDepartments: { $size: 0 } },
                                {
                                    $or: user.department ? [
                                        { targetDepartments: user.department },
                                        // Handle cases like "Computer  Science" vs "Computer Science"
                                        { targetDepartments: user.department.replace(/\s+/g, ' ').trim() },
                                        // Match with regex for missing/extra spaces and case-insensitivity
                                        { targetDepartments: new RegExp(`^${user.department.trim().replace(/\s+/g, '\\s+')}$`, 'i') }
                                    ] : []
                                }
                            ]
                        },
                        {
                            $or: [
                                { targetBatches: { $exists: false } },
                                { targetBatches: { $size: 0 } },
                                { targetBatches: user.batchId }
                            ]
                        }
                    ]
                }
            ];
        } else {
            // Independent student: only public events
            filter.$or = [
                { visibility: "public" },
                { isPublic: true }
            ];
        }

        const eventsRaw = await Event.find(filter).sort({ startTime: -1 });
        console.log(`[DEBUG] /events/available: found ${eventsRaw.length} raw events for filter:`, JSON.stringify(filter));
        if (eventsRaw.length === 0) {
            const allActive = await Event.find({ status: "Active" });
            console.log(`[DEBUG] No events found for student, but ${allActive.length} active events exist in DB.`);
        }

        // Augment events with participant attempt count
        const events = await Promise.all(eventsRaw.map(async (event) => {
            const participant = await EventParticipant.findOne({
                eventId: event._id,
                userId: user.firebaseUid
            });

            return {
                _id: event._id,
                eventName: event.eventName,
                description: event.description || "",
                category: event.category,
                startTime: event.startTime,
                endTime: event.endTime,
                duration: event.duration,
                passPercentage: event.passPercentage || 40,
                maxAttempts: event.maxAttempts || 1,
                attemptsCount: participant ? participant.setResults.length : 0,
                status: event.status
            };
        }));

        res.json({ events });
    } catch (error) {
        console.error("Get available events error:", error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/students/progress/year-wise - Year-wise performance
router.get("/progress/year-wise", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);

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
router.get("/rankings", authenticate, async (req, res) => {
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
