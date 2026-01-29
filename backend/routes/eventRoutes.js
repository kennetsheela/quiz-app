const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("./authRoutes");
const EventService = require("../services/eventService");
const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|docx|doc/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only PDF and DOCX files are allowed"));
  }
});

// Create event (admin only)
router.post("/create", verifyToken, upload.array("setFiles"), async (req, res) => {
  try {
    const event = await EventService.createEvent(req.body, req.files, req.user.uid);
    res.status(201).json({
      message: "Event created successfully",
      eventId: event._id
    });
  } catch (error) {
    console.error("Create event error:", error);
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error("Error deleting file:", err);
        });
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get all events
router.get("/", async (req, res) => {
  try {
    const events = await Event.find()
      .select("-adminPassword -studentPassword")
      .sort({ createdAt: -1 });
    
    res.json({ events });
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific event details
router.get("/:eventId", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
      .select("-adminPassword -studentPassword");
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ event });
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Student login to event
router.post("/student-login", verifyToken, async (req, res) => {
  try {
    const { eventId, rollNo, department, password } = req.body;

    const participant = await EventService.studentLogin({
      eventId,
      userId: req.user.uid,
      rollNo,
      department,
      password
    });

    res.json({ 
      message: "Login successful", 
      participantId: participant._id 
    });
  } catch (error) {
    console.error("Student login error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Get active set for an event
router.get("/:eventId/active-set", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const activeSet = event.sets.find(set => set.isActive);
    
    if (!activeSet) {
      return res.json({ message: "No active set", activeSet: null });
    }

    res.json({ activeSet });
  } catch (error) {
    console.error("Get active set error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start set (student)
router.post("/start-set", verifyToken, async (req, res) => {
  try {
    const { participantId, setId } = req.body;

    const result = await EventService.startSet(participantId, setId, req.user.uid);

    res.json(result);
  } catch (error) {
    console.error("Start set error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Submit set (student)
router.post("/submit-set", verifyToken, async (req, res) => {
  try {
    const { participantId, setId, answers } = req.body;

    const result = await EventService.submitSet({
      participantId,
      setId,
      userId: req.user.uid,
      answers
    });

    res.json({ 
      message: "Set submitted successfully",
      ...result
    });
  } catch (error) {
    console.error("Submit set error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Toggle set active status (admin)
router.post("/toggle-set", verifyToken, async (req, res) => {
  try {
    const { eventId, setId, adminPassword, enable } = req.body;

    await EventService.toggleSet({
      eventId,
      setId,
      adminPassword,
      enable,
      userId: req.user.uid
    });

    res.json({ 
      message: enable ? "Set enabled" : "Set disabled" 
    });
  } catch (error) {
    console.error("Toggle set error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Get participants list (admin)
router.get("/:eventId/participants", verifyToken, async (req, res) => {
  try {
    const participants = await EventParticipant.find({ 
      eventId: req.params.eventId 
    }).sort({ createdAt: -1 });

    res.json({ participants });
  } catch (error) {
    console.error("Get participants error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get event statistics (admin)
router.get("/:eventId/stats", verifyToken, async (req, res) => {
  try {
    const stats = await EventService.getEventStats(req.params.eventId);
    res.json({ stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete event (admin)
router.delete("/:eventId", verifyToken, async (req, res) => {
  try {
    const { adminPassword } = req.body;

    await EventService.deleteEvent(
      req.params.eventId,
      adminPassword,
      req.user.uid
    );

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(400).json({ error: error.message });
  }
});

// ✅ Check remaining time for active quiz
router.get("/check-time/:participantId/:setId", verifyToken, async (req, res) => {
  try {
    const { participantId, setId } = req.params;
    
    const result = await EventService.checkRemainingTime(
      participantId, 
      setId, 
      req.user.uid
    );

    if (result.timeUp) {
      // Auto-submit if time is up
      const submitResult = await EventService.submitSet({
        participantId,
        setId,
        userId: req.user.uid,
        answers: [] // Empty answers for auto-submit
      });

      return res.json({
        timeUp: true,
        message: "Time expired - quiz auto-submitted",
        result: submitResult
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Check time error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Track tab visibility changes (auto-submit on tab switch)
router.post("/tab-switch", verifyToken, async (req, res) => {
  try {
    const { participantId, setId } = req.body;

    // Auto-submit when user leaves the tab
    const submitResult = await EventService.submitSet({
      participantId,
      setId,
      userId: req.user.uid,
      answers: [] // Submit with incomplete answers
    });

    res.json({
      autoSubmitted: true,
      message: "Quiz auto-submitted due to tab switch",
      result: submitResult
    });
  } catch (error) {
    // If already submitted or not found, just log it
    console.log("Tab switch tracking:", error.message);
    res.json({ message: "Tab switch tracked" });
  }
});

module.exports = router;