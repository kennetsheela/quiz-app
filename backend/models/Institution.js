//Institution.js
const mongoose = require("mongoose");

const InstitutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    enum: ["University", "College", "School"],
    required: true
  },
  adminUID: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  location: {
    district: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: 'India' },
    pincode: { type: String },
    fullAddress: { type: String }
  },
  academicConfig: {
    programDuration: { type: Number, default: 4 }, // 3, 4, 5 years
    currentAcademicYear: { type: String },
    graduationMonth: { type: String, default: 'May' },
    semestersPerYear: { type: Number, default: 2 }
  },
  subscription: {
    plan: {
      type: String,
      enum: ["free", "basic", "premium", "enterprise"],
      default: "free"
    },
    status: {
      type: String,
      enum: ["active", "suspended", "expired"],
      default: "active"
    },
    expectedStudents: {
      type: String,
      enum: ["0-100", "101-500", "501-1000", "1000+"]
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Institution", InstitutionSchema);
