const mongoose = require("mongoose");

const EventSetSchema = new mongoose.Schema({
  setName: {
    type: String,
    required: true
  },
  questionsFile: {
    type: String,
    required: true
  },
  timeLimit: {
    type: Number,
    required: true // minutes
  },
  isActive: {
    type: Boolean,
    default: false
  }
});

const EventSchema = new mongoose.Schema({
  eventName: {
    type: String,
    required: true,
    unique: true
  },
  adminPassword: {
    type: String,
    required: true
  },
  studentPassword: {
    type: String,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  sets: {
    type: [EventSetSchema],
    default: []
  },
  createdBy: {
    type: String,
    required: true // Firebase UID
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Event", EventSchema);