const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    enum: ["aids", "cs", "it", "mechanical", "civil", "ece", "eee"],
    required: true
  },
  college: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  photoURL: {
    type: String,
    default: null
  },
  provider: {
    type: String,
    enum: ["email", "google", "github"],
    default: "email"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", UserSchema);