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
   NEW: Check Participation by Email
=========================== */
router.get("/:eventId/check-participation/:email", async (req, res) => {
  try {
    const { eventId, email } = req.params;
    
    console.log(`🔍 Checking participation for email: ${email} in event: ${eventId}`);
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ 
        success: false, 
        message: 'Event not found' 
      });
    }

    // Find participant by email (case-insensitive)
    const participant = await EventParticipant.findOne({
      eventId: eventId,
      email: { $regex: new RegExp(`^${email}$`, 'i') }
    });

    if (participant) {
      // Check if they have any completed sets
      const hasCompleted = participant.setResults && participant.setResults.length > 0;
      
      console.log(`✅ Participant found:`, {
        email: participant.email,
        hasCompleted,
        completedSets: participant.setResults?.length || 0
      });

      // Calculate total score
      const totalScore = participant.setResults?.reduce((sum, result) => 
        sum + (result.score || 0), 0
      ) || 0;
      
      return res.json({
        success: true,
        hasParticipated: true,
        hasCompleted,
        participant: {
          name: `${participant.firstName} ${participant.lastName}`,
          email: participant.email,
          rollNo: participant.rollNo,
          department: participant.department,
          totalScore: totalScore,
          completedSets: participant.setResults?.length || 0,
          setResults: participant.setResults || []
        }
      });
    }

    console.log(`⏳ No participant found with email: ${email}`);
    
    return res.json({
      success: true,
      hasParticipated: false
    });

  } catch (error) {
    console.error('❌ Error checking participation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

/* ===========================
   Student Login
   ⚠️ UPDATED: Now checks for existing participant
=========================== */
router.post("/student-login", verifyToken, async (req, res) => {
  try {
    const { eventId, rollNo, department, password } = req.body;

    console.log(`📝 Student login attempt:`, { 
      eventId, 
      rollNo, 
      department,
      userEmail: req.user.email 
    });

    // Check if this email already has a participant record
    const existingParticipant = await EventParticipant.findOne({
      eventId: eventId,
      email: req.user.email
    });

    if (existingParticipant) {
      // Check if they have completed any sets
      const hasCompletedSets = existingParticipant.setResults && 
                                existingParticipant.setResults.length > 0;

      if (hasCompletedSets) {
        console.log(`⚠️ User already completed event:`, {
          email: req.user.email,
          completedSets: existingParticipant.setResults.length
        });

        return res.status(400).json({ 
          error: "You have already participated in this event",
          alreadyCompleted: true,
          participant: {
            id: existingParticipant._id,
            name: `${existingParticipant.firstName} ${existingParticipant.lastName}`,
            email: existingParticipant.email,
            completedSets: existingParticipant.setResults.length
          }
        });
      }

      // They registered but haven't completed - allow them to continue
      console.log(`✅ Existing participant can continue:`, existingParticipant._id);
      
      return res.json({
        message: "Login successful - continuing your session",
        participantId: existingParticipant._id,
      });
    }

    // New participant - proceed with normal login
    const participant = await EventService.studentLogin({
      eventId,
      userId: req.user.uid,
      email: req.user.email,
      rollNo,
      department,
      password,
    });

    console.log(`✅ New participant created:`, participant._id);

    res.json({
      message: "Login successful",
      participantId: participant._id,
    });
  } catch (error) {
    console.error("❌ Student login error:", error);
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
   ⚠️ UPDATED: Check if already completed
=========================== */
router.post("/start-set", verifyToken, async (req, res) => {
  try {
    const { participantId, setId } = req.body;

    console.log(`🚀 Starting set:`, { participantId, setId });

    // Check if participant already completed this set
    const participant = await EventParticipant.findById(participantId);
    
    if (!participant) {
      return res.status(404).json({ 
        success: false,
        error: "Participant not found" 
      });
    }

    // Check if this set was already completed
    const alreadyCompleted = participant.setResults?.find(
      result => result.setId.toString() === setId
    );

    if (alreadyCompleted) {
      console.log(`⚠️ Set already completed by participant:`, {
        participantId,
        setId,
        score: alreadyCompleted.score
      });

      return res.status(400).json({
        success: false,
        error: "You have already completed this quiz",
        alreadyCompleted: true,
        result: alreadyCompleted
      });
    }

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
    const { participantId, setId, answers, timeTaken } = req.body;

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
      timeTaken: timeTaken || 0,
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
        const submitResult = await EventService.submitSet({
          participantId,
          setId,
          userId: req.user.uid,
          answers: [],
          timeTaken: result.totalTimeLimit || 0,
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
    const { participantId, setId, timeTaken } = req.body;

    const submitResult = await EventService.submitSet({
      participantId,
      setId,
      userId: req.user.uid,
      answers: [],
      timeTaken: timeTaken || 0,
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