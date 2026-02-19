const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    // NOT required at schema level — HOD accounts are created by the backend
    // without a Firebase UID initially (they set their password on first login)
    required: false,
    unique: true,
    sparse: true,   // ← KEY FIX: null/undefined values are excluded from the
                    //   unique index, so multiple HODs can have no UID yet
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ["super-admin", "inst-admin", "hod", "student", "independent"],
    default: "student"
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
    required: false
  },

  // Institution student specific fields
  rollNumber: {
    type: String,
    index: true
  },

  // HOD specific fields
  hodDepartmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department"
  },
  hodPermissions: {
    viewDepartmentStudents:       { type: Boolean, default: true  },
    viewDepartmentAnalytics:      { type: Boolean, default: true  },
    createDepartmentEvents:       { type: Boolean, default: true  },
    createCrossDepartmentEvents:  { type: Boolean, default: false },
    addStudents:                  { type: Boolean, default: true  },
    editStudents:                 { type: Boolean, default: true  },
    deleteStudents:               { type: Boolean, default: false },
    generateReports:              { type: Boolean, default: true  },
    sendNotifications:            { type: Boolean, default: true  }
  },

  // Independent student specific fields
  country:  { type: String },
  ageRange: {
    type: String,
    enum: ["under-18", "18-24", "25-34", "35+"]
  },

  // Legacy fields
  college:  { type: String, required: false },
  city:     { type: String, required: false },
  photoURL: { type: String, default: null   },

  provider: {
    type: String,
    enum: ["email", "google", "github", "anonymous"],
    default: "email"
  },

  // Flag to track if HOD has completed first-login password setup
  isPasswordSet: {
    type: Boolean,
    default: false   // false for HODs until they set their own password
  },

  createdAt: { type: Date, default: Date.now },
  lastLogin:  { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);