//Event.js
const mongoose = require("mongoose");

// Question schema - store questions directly in MongoDB
const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  answer: { type: String, required: true },
  category: String,
  topic: String,
  level: String,
  explanation: String
});

const EventSetSchema = new mongoose.Schema({
  setName: { type: String, required: true },
  timeLimit: { type: Number, required: true }, // minutes
  isActive: { type: Boolean, default: false },
  questions: [QuestionSchema], // ✅ Store questions directly in MongoDB
  originalFilename: String // Optional: keep track of source file
});

const EventSchema = new mongoose.Schema({
  eventName: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  eventCode: {
    type: String,
    unique: true,
    index: true
    // Format: EVT-2025-MAR-15 - auto-generated
  },
  adminPassword: { type: String, required: true },
  studentPassword: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },

  // ✅ ADD THIS FIELD FOR TIMEZONE SUPPORT
  timezone: {
    type: String,
    default: 'UTC',
    required: false
  },

  sets: [EventSetSchema],
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Institution",
    index: true
  },
  targetBatches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Batch"
  }],
  targetDepartments: [{
    type: String // Department names or IDs
  }],

  // Visibility settings
  visibility: {
    type: String,
    enum: ["public", "institution", "department"],
    default: "institution"
  },
  resultsVisibility: {
    type: String,
    enum: ["scores_only", "rank_and_scores", "full_leaderboard", "hidden"],
    default: "rank_and_scores"
  },
  isPublic: {
    type: Boolean,
    default: false
  },

  // Creator information
  createdBy: { type: String, required: true }, // Firebase UID
  createdByRole: {
    type: String,
    enum: ["super-admin", "inst-admin", "hod"],
    required: true
  },
  createdByDeptName: { type: String }, // For HOD-created events
  institutionName: { type: String }, // Cache institution name for filtering

  // QR Code for easy sharing
  qrCodeUrl: {
    type: String
  },

  proctoringConfig: {
    fullscreen: { type: Boolean, default: true },
    tabSwitch: { type: Boolean, default: true },
    webcam: { type: Boolean, default: false },
    randomizeQuestions: { type: Boolean, default: true },
    randomizeOptions: { type: Boolean, default: true }
  },

  category: {
    type: String,
    enum: ["Aptitude", "Reasoning", "Coding", "Technical", "General Knowledge", "General"],
    default: "General"
  },

  marksPerQuestion: { type: Number, default: 1 },
  negativeMarking: { type: Number, default: 0 },
  passPercentage: { type: Number, default: 40 },
  maxAttempts: { type: Number, default: 1 },

  status: {
    type: String,
    enum: ["Active", "Pending", "Completed"],
    default: "Active"
  },
  participantCount: {
    type: Number,
    default: 0
  },

  createdAt: { type: Date, default: Date.now }
});

// Auto-generate eventCode before saving and sync visibility/isPublic
EventSchema.pre('save', function (next) {
  // Sync isPublic and visibility
  if (this.isPublic) {
    this.visibility = 'public';
  } else if (this.visibility === 'public') {
    this.isPublic = true;
  }

  if (!this.eventCode) {
    const date = new Date(this.startTime);
    const year = date.getFullYear();
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = String(date.getDate()).padStart(2, '0');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.eventCode = `EVT-${year}-${month}-${day}-${randomSuffix}`;
  }
  next();
});

module.exports = mongoose.model("Event", EventSchema);
