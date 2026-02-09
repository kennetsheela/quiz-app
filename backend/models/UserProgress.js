//UserProgress.js
const mongoose = require("mongoose");

const UserProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  practiceSetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PracticeSet",
    required: true,
    index: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  score: {
    type: Number,
    default: 0
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestionBank"
    },
    selectedAnswer: String,
    isCorrect: Boolean
  }],
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound index for unique user-set combination
UserProgressSchema.index({ userId: 1, practiceSetId: 1 }, { unique: true });

module.exports = mongoose.model("UserProgress", UserProgressSchema);