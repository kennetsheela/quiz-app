//Batch.js
const mongoose = require("mongoose");

const BatchSchema = new mongoose.Schema({
    batchID: {
        type: String,
        required: true,
        index: true
    },
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Institution",
        required: true
    },
    startYear: {
        type: Number,
        required: true
    },
    endYear: {
        type: Number,
        required: true
    },
    currentYearLevel: {
        type: Number, // 1, 2, 3, 4, etc.
        required: true
    },
    status: {
        type: String,
        enum: ["active", "graduated", "alumni"],
        default: "active"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure batchID is unique within an institution
BatchSchema.index({ batchID: 1, institutionId: 1 }, { unique: true });

module.exports = mongoose.model("Batch", BatchSchema);
