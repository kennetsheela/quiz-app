//QuestionBank.js
const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  questionID: {
    type: String,
    unique: true,
    index: true
    // Format: Q001, Q002, etc. - auto-generated
  },
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
    maxlength: 2000
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
  tags: {
    type: [String],
    default: []
  },
  createdBy: {
    type: String, // Super Admin UID
    required: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate questionID before saving
QuestionSchema.pre('save', async function (next) {
  if (!this.questionID) {
    const count = await mongoose.model('QuestionBank').countDocuments();
    this.questionID = `Q${String(count + 1).padStart(3, '0')}`;
  }
  this.updatedAt = Date.now();
  next();
});

// Compound index for efficient querying
QuestionSchema.index({ category: 1, topic: 1, level: 1 });

module.exports = mongoose.model("QuestionBank", QuestionSchema);