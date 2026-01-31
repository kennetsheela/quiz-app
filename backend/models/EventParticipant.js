const mongoose = require("mongoose");

const EventParticipantSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true // Firebase UID
  },
  rollNo: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  setResults: [
    {
      setId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      startedAt: {
        type: Date,
        default: Date.now
      },
      completedAt: {
        type: Date,
        default: null
      },
      score: {
        type: Number,
        default: null
      },
      totalQuestions: {
        type: Number,
        default: 0
      },
      // ✅ ADD THIS FIELD - Time spent in seconds
      timeTaken: {
        type: Number,
        default: 0,
        required: false
      },
      autoSubmitAt: {
        type: Date,
        default: null
      }
    }
  ]
}, { 
  timestamps: true 
});

// Compound index for efficient lookups
EventParticipantSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("EventParticipant", EventParticipantSchema);