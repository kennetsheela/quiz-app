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
    hodName: {
        type: String
    },
    hodEmail: {
        type: String,
        lowercase: true
    },
    hodPhone: {
        type: String
    },
    hodPermissions: {
        viewDepartmentStudents: { type: Boolean, default: true },
        viewDepartmentAnalytics: { type: Boolean, default: true },
        createDepartmentEvents: { type: Boolean, default: true },
        createCrossDepartmentEvents: { type: Boolean, default: false },
        addStudents: { type: Boolean, default: true },
        editStudents: { type: Boolean, default: true },
        deleteStudents: { type: Boolean, default: false },
        generateReports: { type: Boolean, default: true },
        sendNotifications: { type: Boolean, default: true }
    },
    studentCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure department code is unique per institution
DepartmentSchema.index({ code: 1, institutionId: 1 }, { unique: true });

module.exports = mongoose.model("Department", DepartmentSchema);
