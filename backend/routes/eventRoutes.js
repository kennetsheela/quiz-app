//eventRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

const { authenticate, allowRoles, isolateInstitution } = require("../middleware/authMiddleware");

const adminOnly = [authenticate, allowRoles(["institutionAdmin"])];
const staffOnly = [authenticate, allowRoles(["institutionAdmin", "hod"])];
const studentOnly = [authenticate, allowRoles(["student"])];
const anyUser = [authenticate];
const EventService = require("../services/eventService");
const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");
const User = require("../models/User");

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
  staffOnly,
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
   Get Events by Creator
=========================== */
router.get("/creator/:creatorId", anyUser, isolateInstitution, async (req, res) => {
  try {
    const { creatorId } = req.params;
    const institutionId = req.query.institutionId;
    const events = await EventService.getEventsByCreator(creatorId, institutionId);
    res.json({ success: true, events });
  } catch (error) {
    console.error("Get events by creator error:", error);
    res.status(500).json({ success: false, error: error.message });
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
   Check Participation by Email
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
router.post("/student-login", authenticate, async (req, res) => {
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
router.post("/start-set", authenticate, async (req, res) => {
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
router.post("/submit-set", authenticate, async (req, res) => {
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
router.post("/toggle-set", staffOnly, async (req, res) => {
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
   Get All Participants (Admin)
=========================== */
router.get("/:eventId/participants", staffOnly, async (req, res) => {
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
   ⭐ NEW: Get Single Participant
=========================== */
router.get("/participants/:participantId", staffOnly, async (req, res) => {
  try {
    const participant = await EventParticipant.findById(req.params.participantId);

    if (!participant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    console.log('📊 Fetched participant:', {
      id: participant._id,
      email: participant.email,
      completedSets: participant.setResults?.length || 0
    });

    res.json({ participant });
  } catch (error) {
    console.error("Get participant error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===========================
   ⭐ NEW: Get Visibility-Aware Results
=========================== */
router.get("/:eventId/results/:participantId", authenticate, async (req, res) => {
  try {
    const { eventId, participantId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const participant = await EventParticipant.findById(participantId);
    if (!participant) return res.status(404).json({ error: "Participant not found" });

    // Security check: only the student or an admin can see results
    const isOwner = participant.userId === req.user.uid;
    if (!isOwner) {
      return res.status(403).json({ error: "Access denied" });
    }

    const visibility = event.resultsVisibility || "rank_and_scores";

    if (visibility === "hidden") {
      return res.json({
        visibility: "hidden",
        eventName: event.eventName,
        message: "Your submission was successful. Detailed results are currently hidden by the organizer."
      });
    }

    // Get latest result
    const latestResult = participant.setResults[participant.setResults.length - 1];

    // Calculate Rank across all participants
    const allParticipants = await EventParticipant.find({ eventId });

    // Aggregate scores for ranking
    const participationScores = allParticipants.map(p => {
      const latest = p.setResults[p.setResults.length - 1] || {};
      return {
        id: p._id.toString(),
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        rollNo: p.rollNo || "N/A",
        department: p.department || "General",
        batchName: p.batchName || "N/A",
        score: latest.score || 0,
        timeTaken: latest.timeTaken || 0,
        percentage: latest.percentage || 0,
        passed: latest.passed || false
      };
    });

    // Sort: Score (desc) -> Time Taken (asc)
    participationScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTaken - b.timeTaken;
    });

    const rank = participationScores.findIndex(p => p.id === participantId) + 1;

    let response = {
      visibility,
      eventName: event.eventName,
      participant: {
        name: `${participant.firstName} ${participant.lastName}`,
        email: participant.email,
        rollNo: participant.rollNo,
        department: participant.department
      },
      result: {
        score: latestResult.score,
        totalQuestions: latestResult.totalQuestions,
        correctAnswers: latestResult.correctAnswers,
        wrongAnswers: latestResult.wrongAnswers,
        skipped: latestResult.skipped,
        percentage: latestResult.percentage,
        passed: latestResult.passed,
        timeTaken: latestResult.timeTaken
      }
    };

    if (visibility === "rank_and_scores" || visibility === "full_leaderboard") {
      response.rank = rank;
      response.totalParticipants = allParticipants.length;
    }

    if (visibility === "full_leaderboard") {
      response.leaderboard = participationScores.slice(0, 10).map((p, i) => ({
        rank: i + 1,
        name: p.name,
        rollNo: p.rollNo,
        department: p.department,
        batchName: p.batchName,
        score: p.score,
        timeTaken: p.timeTaken,
        isCurrent: p.id === participantId
      }));
    }

    res.json(response);

  } catch (error) {
    console.error("Get results error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===========================
   Event Statistics (Admin)
=========================== */
router.get("/:eventId/stats", staffOnly, async (req, res) => {
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
router.delete("/:eventId", adminOnly, async (req, res) => {
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
  authenticate,
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
router.post("/tab-switch", authenticate, async (req, res) => {
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

// ─── Event Participation (Student) ──────────────────────────────────────────

// 1. Fetch Event for Taking (starts/resumes session)
router.get("/:eventId/take", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return res.status(404).json({ error: "User profile not found" });

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.status !== "Active") {
      return res.status(400).json({ error: "This event is not currently active" });
    }

    // Find or Create Participant record
    let participant = await EventParticipant.findOne({ eventId, userId: user.firebaseUid });

    // Check attempt limits
    const maxAttempts = event.maxAttempts || 1;
    const currentAttempts = participant ? participant.setResults.length : 0;

    if (currentAttempts >= maxAttempts) {
      return res.status(403).json({
        error: "Attempt limit reached",
        message: `You have already used all ${maxAttempts} available attempts for this event.`
      });
    }

    if (!participant) {
      participant = await EventParticipant.create({
        eventId,
        userId: user.firebaseUid,
        firstName: user.firstName || user.username.split(' ')[0],
        lastName: user.lastName || user.username.split(' ')[1] || "",
        email: user.email,
        college: user.institutionId,
        department: user.department || "General",
        rollNo: user.rollNumber || "N/A",
        setResults: []
      });
    }

    // Pick first set
    const set = event.sets[0];
    if (!set) {
      console.error(`❌ Event ${eventId} has no sets defined.`);
      return res.status(404).json({
        error: "Questions set not found",
        message: "No question sets have been created for this event. Please wait for the administrator to start or update the event."
      });
    }

    if (!set.questions || set.questions.length === 0) {
      console.error(`❌ Event ${eventId} set ${set.setName} has NO questions.`);
      return res.status(404).json({
        error: "Questions not found",
        message: "This event currently contains no questions. Please contact the administrator."
      });
    }

    let questions = JSON.parse(JSON.stringify(set.questions));
    if (event.proctoringConfig?.randomizeQuestions) {
      questions = questions.sort(() => Math.random() - 0.5);
    }
    if (event.proctoringConfig?.randomizeOptions) {
      questions.forEach(q => q.options = q.options.sort(() => Math.random() - 0.5));
    }

    res.json({
      eventName: event.eventName,
      duration: set.timeLimit,
      marksPerQuestion: event.marksPerQuestion || 1,
      negativeMarking: event.negativeMarking || 0,
      proctoringConfig: event.proctoringConfig,
      questions: questions.map(q => ({
        _id: q._id,
        questionText: q.question,
        options: q.options
      }))
    });

  } catch (error) {
    console.error("Take event error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Log Violation
router.post("/:eventId/violation", authenticate, async (req, res) => {
  try {
    console.warn(`[Proctoring] Violation by ${req.user.email} in ${req.params.eventId}: ${req.body.reason}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Submit Results
router.post("/:eventId/submit", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { answers, violations, timeSpent } = req.body;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const set = event.sets[0];
    const questions = set.questions;

    let score = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    questions.forEach(q => {
      const userAns = answers[q._id];
      if (!userAns) {
        skipped++;
      } else if (userAns === q.answer) {
        correct++;
        score += event.marksPerQuestion || 1;
      } else {
        wrong++;
        score -= event.negativeMarking || 0;
      }
    });

    const percentage = Number(((correct / questions.length) * 100).toFixed(2));
    const passPercentage = event.passPercentage || 40;
    const passed = percentage >= passPercentage;

    const participant = await EventParticipant.findOneAndUpdate(
      { eventId, userId: req.user.uid },
      {
        $push: {
          setResults: {
            setId: set._id,
            setName: set.setName,
            completedAt: new Date(),
            score,
            totalQuestions: questions.length,
            timeTaken: timeSpent,
            correctAnswers: correct,
            wrongAnswers: wrong,
            skipped,
            percentage,
            passed,
            remarks: passed ? "Passed" : "Failed",
            answers: Object.values(answers)
          }
        }
      },
      { new: true }
    );

    // Increment participantCount on the Event model only if this is the first setResult
    if (participant.setResults.length === 1) {
      await Event.findByIdAndUpdate(eventId, { $inc: { participantCount: 1 } });
    }

    res.json({
      success: true,
      score,
      correct,
      wrong,
      total: questions.length,
      attemptId: participant._id
    });

  } catch (error) {
    console.error("Submit event error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Fetch Participant Results (for results.html)
router.get("/participants/:participantId", staffOnly, async (req, res) => {
  try {
    const participant = await EventParticipant.findById(req.params.participantId);
    if (!participant) return res.status(404).json({ error: "Participant record not found" });
    // Security: only the owner can see their results
    if (participant.userId !== req.user.uid) return res.status(403).json({ error: "Access denied" });
    res.json({ participant });
  } catch (error) {
    console.error("Fetch participant error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
