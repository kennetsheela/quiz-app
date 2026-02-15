//Department.js
const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String, // CS, ECE, MECH, etc.
        required: true,
        uppercase: true
    },
    institutionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Institution",
        required: true
    },
    hodUID: {
        type: String, // Firebase UID of the HOD user
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure department code is unique per institution
DepartmentSchema.index({ code: 1, institutionId: 1 }, { unique: true });

module.exports = mongoose.model("Department", DepartmentSchema);
