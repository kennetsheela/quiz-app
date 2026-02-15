//User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
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
    required: false // Made optional for Super Admins and Independent students
  },
  college: {
    type: String,
    required: false // For institution students, we use institutionId reference
  },
  city: {
    type: String,
    required: false
  },
  photoURL: {
    type: String,
    default: null
  },
  provider: {
    type: String,
    enum: ["email", "google", "github", "anonymous"],
    default: "email"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", UserSchema);