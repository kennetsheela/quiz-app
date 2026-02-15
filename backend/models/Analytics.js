//Analytics.js
const mongoose = require("mongoose");

const AnalyticsSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ["platform", "institution", "department", "batch", "event"],
        required: true,
        index: true
    },

    // Reference IDs based on type
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Institution",
        index: true
    },
    departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department"
    },
    batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch"
    },
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event"
    },

    // Time period
    period: {
        type: String,
        enum: ["daily", "weekly", "monthly", "yearly", "all-time"],
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },

    // Aggregated data
    data: {
        totalStudents: { type: Number, default: 0 },
        totalEvents: { type: Number, default: 0 },
        totalParticipations: { type: Number, default: 0 },
        averageScore: { type: Number, default: 0 },
        averageAttendance: { type: Number, default: 0 },

        // Category-wise performance
        categoryPerformance: [{
            category: String,
            averageScore: Number,
            totalQuestions: Number,
            correctAnswers: Number
        }],

        // Top performers
        topPerformers: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            name: String,
            rollNumber: String,
            score: Number,
            rank: Number
        }],

        // Growth metrics
        growth: {
            studentGrowth: Number, // percentage
            eventGrowth: Number,
            scoreImprovement: Number
        }
    },

    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound indexes for efficient querying
AnalyticsSchema.index({ type: 1, institutionId: 1, period: 1 });
AnalyticsSchema.index({ type: 1, batchId: 1, period: 1 });
AnalyticsSchema.index({ type: 1, departmentId: 1, period: 1 });

// Update timestamp on save
AnalyticsSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model("Analytics", AnalyticsSchema);
