//QuestionBank.js
const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ["aptitude", "reasoning", "coding", "technical"],
    index: true
  },
  topic: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  level: {
    type: String,
    required: true,
    enum: ["easy", "medium", "hard"],
    index: true
  },
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength:2000
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: v => v.length >= 2 && v.length <= 4,
      message: "Must have 2-4 options"
    }
  },
  correctAnswer: {
    type: String,
    required: true
  },
  explanation: {
    type: String,
    default: ""
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient querying
QuestionSchema.index({ category: 1, topic: 1, level: 1 });

module.exports = mongoose.model("QuestionBank", QuestionSchema);