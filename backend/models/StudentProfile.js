//StudentProfile.js
const mongoose = require("mongoose");

const YearPerformanceSchema = new mongoose.Schema({
    year: { type: Number, required: true }, // 1, 2, 3, 4
    academicYear: { type: String }, // "2023-2024"
    eventsAttended: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 }
});

const StudentProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true
    },
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Institution",
        index: true
    },
    batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
        index: true
    },
    department: {
        type: String,
        index: true
    },

    // Overall statistics
    totalEventsAttended: {
        type: Number,
        default: 0
    },
    overallAverage: {
        type: Number,
        default: 0
    },
    bestScore: {
        type: Number,
        default: 0
    },

    // Year-wise performance tracking
    yearWisePerformance: [YearPerformanceSchema],

    // Rankings
    rankings: {
        departmentRank: { type: Number },
        batchRank: { type: Number },
        institutionRank: { type: Number },
        yearRank: { type: Number }, // Rank within current year level
        lastUpdated: { type: Date }
    },

    // Event participation history
    eventHistory: [{
        eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
        eventName: { type: String },
        date: { type: Date },
        score: { type: Number },
        percentage: { type: Number },
        rank: { type: Number },
        totalParticipants: { type: Number }
    }],

    // Badges & achievements
    badges: [{
        name: { type: String },
        description: { type: String },
        earnedDate: { type: Date },
        icon: { type: String }
    }],

    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
StudentProfileSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model("StudentProfile", StudentProfileSchema);
