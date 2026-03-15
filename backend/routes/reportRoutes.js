// backend/routes/reportRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { authenticate, allowRoles } = require("../middleware/authMiddleware");

const instAdminOnly = [authenticate, allowRoles(["institutionAdmin"])];
const EventParticipant = require("../models/EventParticipant");
const Event = require("../models/Event");

/**
 * Filter Parsing Logic
 */
function parseReportFilters(query, institutionId) {
    const { period, department, batch } = query;
    const match = { college: new mongoose.Types.ObjectId(institutionId) };

    // Period
    if (period) {
        let days = 30;
        if (period === '90') days = 90;
        else if (period === '180') days = 180;
        else if (period === 'academic') days = 365;

        const since = new Date();
        since.setDate(since.getDate() - days);
        match.createdAt = { $gte: since };
    }

    // Department
    if (department && department !== 'All Departments') {
        match.department = new RegExp(`^${department}$`, 'i');
    }

    // Batch
    if (batch && batch !== 'All Batches') {
        if (mongoose.Types.ObjectId.isValid(batch)) {
            match.batchId = new mongoose.Types.ObjectId(batch);
        } else {
            match.batchName = new RegExp(`^${batch}$`, 'i');
        }
    }

    return match;
}

/**
 * Category Filter Helper (applied after lookup)
 */
function getCategoryMatch(categoryQuery) {
    if (!categoryQuery || categoryQuery === 'all' || categoryQuery === '') return null;
    const cats = categoryQuery.split(',').filter(Boolean);
    if (cats.length === 0) return null;
    return { "eventInfo.category": { $in: cats } };
}

function getCreatorMatch(query) {
    const { createdByRole, creatorDept } = query;
    const match = {};

    if (createdByRole) {
        if (createdByRole === 'inst-admin') {
            // Include Institution Admin, Super Admin, and old events (no role AND no creatorDeptName)
            match.$or = [
                { "eventInfo.createdByRole": "inst-admin" },
                { "eventInfo.createdByRole": "super-admin" },
                {
                    $and: [
                        { "eventInfo.createdByRole": { $exists: false } },
                        { "eventInfo.createdByDeptName": { $exists: false } }
                    ]
                }
            ];
        } else if (createdByRole === 'hod') {
            // Include explicit hod role or old events with a creatorDeptName
            match.$or = [
                { "eventInfo.createdByRole": "hod" },
                {
                    $and: [
                        { "eventInfo.createdByRole": { $exists: false } },
                        { "eventInfo.createdByDeptName": { $exists: true, $ne: "" } }
                    ]
                }
            ];
            // Filter by specific department if provided
            if (creatorDept && creatorDept !== 'All Departments' && creatorDept !== '') {
                match["eventInfo.createdByDeptName"] = creatorDept;
            }
        } else {
            match["eventInfo.createdByRole"] = createdByRole;
        }
    }

    return Object.keys(match).length > 0 ? match : null;
}

/**
 * 1. Trend Data
 */
router.get("/trend", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.user.institutionId;
        const baseMatch = parseReportFilters(req.query, institutionId);
        const categoryMatch = getCategoryMatch(req.query.category);
        const creatorMatch = getCreatorMatch(req.query);

        const pipeline = [
            { $match: baseMatch },
            {
                $lookup: {
                    from: "events",
                    localField: "eventId",
                    foreignField: "_id",
                    as: "eventInfo"
                }
            },
            { $unwind: "$eventInfo" }
        ];

        if (categoryMatch) pipeline.push({ $match: categoryMatch });
        if (creatorMatch) pipeline.push({ $match: creatorMatch });

        pipeline.push(
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        category: "$eventInfo.category"
                    },
                    avgScore: { $avg: "$setResults.percentage" }
                }
            },
            { $sort: { "_id.date": 1 } },
            {
                $group: {
                    _id: "$_id.date",
                    categories: {
                        $push: {
                            category: "$_id.category",
                            score: { $round: ["$avgScore", 1] }
                        }
                    }
                }
            },
            { $sort: { "_id": 1 } }
        );

        const data = await EventParticipant.aggregate(pipeline);

        const labels = data.map(d => d._id);
        const categories = [...new Set(data.flatMap(d => d.categories.map(c => c.category)))];

        const datasets = categories.map(cat => ({
            label: cat,
            data: labels.map(label => {
                const day = data.find(d => d._id === label);
                const catData = day.categories.find(c => c.category === cat);
                return catData ? catData.score : null;
            })
        }));

        res.json({ labels, datasets });
    } catch (err) {
        console.error("Trend Error:", err);
        res.status(500).json({ error: "Failed to fetch trend data." });
    }
});

/**
 * 2. Heatmap Data
 */
router.get("/heatmap", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.user.institutionId;
        const baseMatch = parseReportFilters(req.query, institutionId);
        const categoryMatch = getCategoryMatch(req.query.category);

        const pipeline = [
            { $match: baseMatch },
            {
                $lookup: {
                    from: "events",
                    localField: "eventId",
                    foreignField: "_id",
                    as: "eventInfo"
                }
            },
            { $unwind: "$eventInfo" }
        ];

        if (categoryMatch) pipeline.push({ $match: categoryMatch });
        const creatorMatch = getCreatorMatch(req.query);
        if (creatorMatch) pipeline.push({ $match: creatorMatch });

        pipeline.push(
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            {
                $group: {
                    _id: {
                        department: "$department",
                        category: "$eventInfo.category"
                    },
                    avgScore: { $avg: "$setResults.percentage" }
                }
            }
        );

        const data = await EventParticipant.aggregate(pipeline);
        const formatted = data.map(d => ({
            department: d._id.department || "General",
            category: d._id.category || "General",
            avg_score: Math.round(d.avgScore)
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Heatmap Error:", err);
        res.status(500).json({ error: "Failed to fetch heatmap data." });
    }
});

/**
 * 3. Batch Comparison
 */
router.get("/batch-comparison", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.user.institutionId;
        const baseMatch = parseReportFilters(req.query, institutionId);
        const categoryMatch = getCategoryMatch(req.query.category);

        const pipeline = [
            { $match: baseMatch },
            {
                $lookup: {
                    from: "events",
                    localField: "eventId",
                    foreignField: "_id",
                    as: "eventInfo"
                }
            },
            { $unwind: "$eventInfo" }
        ];

        if (categoryMatch) pipeline.push({ $match: categoryMatch });
        const creatorMatch = getCreatorMatch(req.query);
        if (creatorMatch) pipeline.push({ $match: creatorMatch });

        pipeline.push(
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            {
                $group: {
                    _id: {
                        batch: "$batchName",
                        category: "$eventInfo.category"
                    },
                    avgScore: { $avg: "$setResults.percentage" }
                }
            }
        );

        const data = await EventParticipant.aggregate(pipeline);
        const formatted = data.map(d => ({
            batch: d._id.batch || "N/A",
            category: d._id.category || "General",
            avg_score: Math.round(d.avgScore)
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Batch Comparison Error:", err);
        res.status(500).json({ error: "Failed to fetch batch comparison data." });
    }
});

/**
 * 4. Overall Summary Snapshot
 */
router.get("/summary", instAdminOnly, async (req, res) => {
    try {
        const institutionId = req.user.institutionId;
        const baseMatch = parseReportFilters(req.query, institutionId);
        const categoryMatch = getCategoryMatch(req.query.category);

        const pipeline = [
            { $match: baseMatch },
            {
                $lookup: {
                    from: "events",
                    localField: "eventId",
                    foreignField: "_id",
                    as: "eventInfo"
                }
            },
            { $unwind: "$eventInfo" }
        ];

        if (categoryMatch) pipeline.push({ $match: categoryMatch });
        const creatorMatch = getCreatorMatch(req.query);
        if (creatorMatch) pipeline.push({ $match: creatorMatch });

        const statsPipeline = [
            ...pipeline,
            { $unwind: "$setResults" },
            { $match: { "setResults.completedAt": { $ne: null } } },
            {
                $group: {
                    _id: null,
                    totalStudents: { $addToSet: "$email" },
                    avgScore: { $avg: "$setResults.percentage" }
                }
            }
        ];

        const statsData = await EventParticipant.aggregate(statsPipeline);
        const stats = statsData[0] || { totalStudents: [], avgScore: 0 };

        // Top Dept, Batch, Category
        const topDept = await EventParticipant.aggregate([
            ...pipeline,
            { $unwind: "$setResults" },
            { $group: { _id: "$department", avg: { $avg: "$setResults.percentage" } } },
            { $sort: { avg: -1 } }, { $limit: 1 }
        ]);

        const topBatch = await EventParticipant.aggregate([
            ...pipeline,
            { $unwind: "$setResults" },
            { $group: { _id: "$batchName", avg: { $avg: "$setResults.percentage" } } },
            { $sort: { avg: -1 } }, { $limit: 1 }
        ]);

        const topCat = await EventParticipant.aggregate([
            ...pipeline,
            { $unwind: "$setResults" },
            { $group: { _id: "$eventInfo.category", avg: { $avg: "$setResults.percentage" } } },
            { $sort: { avg: -1 } }, { $limit: 1 }
        ]);

        const donutData = await EventParticipant.aggregate([
            ...pipeline,
            { $unwind: "$setResults" },
            { $group: { _id: "$eventInfo.category", score: { $avg: "$setResults.percentage" } } }
        ]);

        res.json({
            total_students: stats.totalStudents.length,
            avg_score: Math.round(stats.avgScore),
            top_department: topDept[0]?._id || "N/A",
            top_batch: topBatch[0]?._id || "N/A",
            highest_category: topCat[0]?._id || "N/A",
            donut: donutData.map(d => ({ category: d._id || "General", score: Math.round(d.score) }))
        });

    } catch (err) {
        console.error("Summary Error:", err);
        res.status(500).json({ error: "Failed to fetch summary data." });
    }
});

module.exports = router;
