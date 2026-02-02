PracticeSet.js
const mongoose = require("mongoose");

const PracticeSetSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ["aptitude", "reasoning", "coding", "technical"]
  },
  topic: {
    type: String,
    required: true
  },
  level: {
    type: String,
    required: true,
    enum: ["easy", "medium", "hard"]
  },
  setNumber: {
    type: Number,
    required: true
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "QuestionBank"
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure unique sets
PracticeSetSchema.index({ category: 1, topic: 1, level: 1, setNumber: 1 }, { unique: true });

module.exports = mongoose.model("PracticeSet", PracticeSetSchema);