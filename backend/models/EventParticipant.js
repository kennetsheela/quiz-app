// models/EventParticipant.js - UPDATED for Analytics
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
  
  // ✅ NEW: Student Information Fields
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  rollNo: {
    type: String,
    required: true,
    trim: true
  },
  
  // ✅ NEW: College and Department References
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "College",
    required: true,
    index: true
  },
  department: {
    type: String, // Keep as string for backward compatibility
    required: true,
    index: true
  },
  departmentCode: {
    type: String, // e.g., "CSE", "ECE"
    trim: true,
    uppercase: true
  },
  
  // Quiz Results
  setResults: [
    {
      setId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      setName: {
        type: String,
        default: ""
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
      timeTaken: {
        type: Number, // in seconds
        default: 0
      },
      correctAnswers: {
        type: Number,
        default: 0
      },
      wrongAnswers: {
        type: Number,
        default: 0
      },
      skipped: {
        type: Number,
        default: 0
      },
      percentage: {
        type: Number,
        default: 0
      },
      autoSubmitAt: {
        type: Date,
        default: null
      },
      answers: [String] // Array of user's answers
    }
  ]
}, { 
  timestamps: true 
});

// ✅ Compound Indexes for Analytics Queries
EventParticipantSchema.index({ eventId: 1, userId: 1 }, { unique: true });
EventParticipantSchema.index({ eventId: 1, college: 1 });
EventParticipantSchema.index({ eventId: 1, department: 1 });
EventParticipantSchema.index({ eventId: 1, college: 1, department: 1 });
EventParticipantSchema.index({ email: 1 });

// ✅ Virtual for full name
EventParticipantSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// ✅ Virtual for total score across all sets
EventParticipantSchema.virtual('totalScore').get(function() {
  return this.setResults.reduce((sum, result) => 
    sum + (result.score || 0), 0
  );
});

// ✅ Virtual for average percentage
EventParticipantSchema.virtual('averagePercentage').get(function() {
  const completed = this.setResults.filter(r => r.completedAt);
  if (completed.length === 0) return 0;
  
  const totalPercentage = completed.reduce((sum, result) => 
    sum + (result.percentage || 0), 0
  );
  return Math.round(totalPercentage / completed.length);
});

// ✅ Virtual for total time taken
EventParticipantSchema.virtual('totalTimeTaken').get(function() {
  return this.setResults.reduce((sum, result) => 
    sum + (result.timeTaken || 0), 0
  );
});

// Ensure virtuals are included in JSON
EventParticipantSchema.set('toJSON', { virtuals: true });
EventParticipantSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("EventParticipant", EventParticipantSchema);