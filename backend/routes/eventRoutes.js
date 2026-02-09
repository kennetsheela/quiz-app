//eventRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

const { verifyToken } = require("./authRoutes");
const EventService = require("../services/eventService");
const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");

/* ===========================
   Multer Configuration
=========================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|docx|doc/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype =
      allowedTypes.test(file.mimetype) ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only PDF and DOC/DOCX files are allowed"));
  },
});

/* ===========================
   Create Event (Admin)
=========================== */
router.post(
  "/create",
  verifyToken,
  upload.array("setFiles"),
  async (req, res) => {
    try {
      const event = await EventService.createEvent(
        req.body,
        req.files,
        req.user.uid
      );

      res.status(201).json({
        message: "Event created successfully",
        eventId: event._id,
        sets: event.sets.map((s) => ({
          name: s.setName,
          questionCount: s.questions.length,
        })),
      });
    } catch (error) {
      console.error("Create event error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/* ===========================
   Get All Events
=========================== */
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

/* ===========================
   Get Event Details
=========================== */
router.get("/:eventId", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId).select(
      "-adminPassword -studentPassword"
    );

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ event });
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===========================
   Student Login
=========================== */
router.post("/student-login", verifyToken, async (req, res) => {
  try {
    const { eventId, rollNo, department, password } = req.body;

    const participant = await EventService.studentLogin({
      eventId,
      userId: req.user.uid,
      rollNo,
      department,
      password,
    });

    res.json({
      message: "Login successful",
      participantId: participant._id,
    });
  } catch (error) {
    console.error("Student login error:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===========================
   Get Active Set
=========================== */
router.get("/:eventId/active-set", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const activeSet = event.sets.find((set) => set.isActive);

    if (!activeSet) {
      return res.json({ message: "No active set", activeSet: null });
    }

    res.json({ activeSet });
  } catch (error) {
    console.error("Get active set error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===========================
   Start Set (Student)
=========================== */
router.post("/start-set", verifyToken, async (req, res) => {
  try {
    const { participantId, setId } = req.body;

    const result = await EventService.startSet(
      participantId,
      setId,
      req.user.uid
    );

    res.json(result);
  } catch (error) {
    console.error("Start set error:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===========================
   Submit Set (Student)
   ⚠️ UPDATED: Now accepts timeTaken parameter
=========================== */
router.post("/submit-set", verifyToken, async (req, res) => {
  try {
    // ✅ ADDED: Extract timeTaken from request body
    const { participantId, setId, answers, timeTaken } = req.body;

    // 🔍 DEBUG: Log received data
    console.log('📊 Submit Set Request:', {
      participantId,
      setId,
      answersCount: answers?.length || 0,
      timeTaken: timeTaken || 0,
      timeTakenType: typeof timeTaken
    });

    const result = await EventService.submitSet({
      participantId,
      setId,
      userId: req.user.uid,
      answers,
      timeTaken: timeTaken || 0, // ✅ ADDED: Pass timeTaken to service
    });

    res.json({
      message: "Set submitted successfully",
      ...result,
    });
  } catch (error) {
    console.error("Submit set error:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===========================
   Toggle Set (Admin)
=========================== */
router.post("/toggle-set", verifyToken, async (req, res) => {
  try {
    const { eventId, setId, adminPassword, enable } = req.body;

    await EventService.toggleSet({
      eventId,
      setId,
      adminPassword,
      enable,
      userId: req.user.uid,
    });

    res.json({
      message: enable ? "Set enabled" : "Set disabled",
    });
  } catch (error) {
    console.error("Toggle set error:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===========================
   Get Participants (Admin)
=========================== */
router.get("/:eventId/participants", verifyToken, async (req, res) => {
  try {
    const participants = await EventParticipant.find({
      eventId: req.params.eventId,
    }).sort({ createdAt: -1 });

    // 🔍 DEBUG: Log participant data structure
    if (participants.length > 0) {
      console.log('📊 Sample Participant Data:', {
        rollNo: participants[0].rollNo,
        setResultsCount: participants[0].setResults?.length || 0,
        firstResult: participants[0].setResults?.[0] || null
      });
    }

    res.json({ participants });
  } catch (error) {
    console.error("Get participants error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===========================
   Event Statistics (Admin)
=========================== */
router.get("/:eventId/stats", verifyToken, async (req, res) => {
  try {
    const stats = await EventService.getEventStats(req.params.eventId);
    res.json({ stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===========================
   Delete Event (Admin)
=========================== */
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

/* ===========================
   Check Remaining Time
=========================== */
router.get(
  "/check-time/:participantId/:setId",
  verifyToken,
  async (req, res) => {
    try {
      const { participantId, setId } = req.params;

      const result = await EventService.checkRemainingTime(
        participantId,
        setId,
        req.user.uid
      );

      if (result.timeUp) {
        // ✅ UPDATED: Include timeTaken when auto-submitting on time-up
        const submitResult = await EventService.submitSet({
          participantId,
          setId,
          userId: req.user.uid,
          answers: [],
          timeTaken: result.totalTimeLimit || 0, // Use full time limit
        });

        return res.json({
          timeUp: true,
          message: "Time expired - quiz auto-submitted",
          result: submitResult,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Check time error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

/* ===========================
   Tab Switch Tracking
=========================== */
router.post("/tab-switch", verifyToken, async (req, res) => {
  try {
    // ✅ UPDATED: Extract timeTaken if provided
    const { participantId, setId, timeTaken } = req.body;

    const submitResult = await EventService.submitSet({
      participantId,
      setId,
      userId: req.user.uid,
      answers: [],
      timeTaken: timeTaken || 0, // ✅ ADDED: Include timeTaken
    });

    res.json({
      autoSubmitted: true,
      message: "Quiz auto-submitted due to tab switch",
      result: submitResult,
    });
  } catch (error) {
    console.log("Tab switch tracked:", error.message);
    res.json({ message: "Tab switch tracked" });
  }
});

/* ===========================
   Multer Error Handler
=========================== */
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File size too large. Maximum size is 1MB per file.",
      });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

module.exports = router;