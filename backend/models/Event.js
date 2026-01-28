const mongoose = require("mongoose");

// Question schema - store questions directly in MongoDB
const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true },
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
  adminPassword: { type: String, required: true },
  studentPassword: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  sets: [EventSetSchema],
  createdBy: { type: String, required: true }, // Firebase UID
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", EventSchema);