//PracticeProgress.js
const mongoose = require("mongoose");

const PracticeProgressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  level: {
    type: String,
    required: true
  },
  setNumber: {
    type: Number,
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  timeLimit: {           // ⏱ Add time limit in minutes
    type: Number,
    default: 10
  },
  score: {
    type: Number,
    min: 0,
    default: null
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  isActive: {            // 🔒 Flag to prevent multiple tabs
    type: Boolean,
    default: false
  },
  answers: [{
    questionId: mongoose.Schema.Types.ObjectId,
    selectedAnswer: String,
    isCorrect: Boolean,
    timeSpent: {         // ⭐ NEW: Time spent on this question in seconds
      type: Number,
      default: null
    }
  }]
});

// One progress per user per set
PracticeProgressSchema.index(
  { userId: 1, category: 1, topic: 1, level: 1, setNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model("PracticeProgress", PracticeProgressSchema);