//eventService.js
const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");
const bcrypt = require("bcrypt");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const parseStrict = require("../utils/parseStrict");

// ✅ Parse questions from file buffer and store in MongoDB
async function parseQuestionsFromFile(file, metadata = {}) {
  const ext = file.originalname.toLowerCase().endsWith('.pdf') ? '.pdf' : '.docx';
  let textContent = "";

  try {
    if (ext === ".pdf") {
      const data = await pdfParse(file.buffer);
      textContent = data.text;
      console.log(`📄 Extracted ${data.text.length} characters from PDF`);
    } else {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      textContent = result.value;
      console.log(`📄 Extracted ${textContent.length} characters from DOCX`);
    }

    // Use robust parser
    const questions = parseStrict(textContent, metadata);

    if (questions.length === 0) {
      console.error("❌ No questions parsed from text:", textContent.substring(0, 500));
      throw new Error("No valid questions found in file. Please ensure the format matches (e.g., 1. Question... A. Option... Answer: A)");
    }

    console.log(`✅ Successfully parsed ${questions.length} questions`);
    return questions;

  } catch (error) {
    console.error("❌ Question parsing error:", error);
    throw new Error(`Failed to parse questions: ${error.message}`);
  }
}

// ✅ Create event with proper targeting and proctoring
async function createEvent(data, files, userId) {
  const {
    eventName,
    adminPassword,
    studentPassword,
    startTime,
    endTime,
    sets,
    institutionId,
    targetBatches,
    targetDepartments,
    isPublic,
    proctoringConfig,
    marksPerQuestion,
    negativeMarking,
    description,
    passPercentage,
    maxAttempts
  } = data;

  if (!eventName || !adminPassword || !studentPassword || !startTime || !endTime || !sets) {
    throw new Error("All fields are required");
  }

  const parsedSets = JSON.parse(sets);

  // ✅ Parse questions from each file and store in MongoDB
  const eventSets = await Promise.all(
    parsedSets.map(async (set, index) => {
      const file = files[index];

      let questions = [];

      if (file) {
        try {
          questions = await parseQuestionsFromFile(file);
          console.log(`✅ Parsed ${questions.length} questions for set: ${set.setName}`);
        } catch (error) {
          console.error(`❌ Error parsing file for set ${set.setName}:`, error);
          throw new Error(`Failed to parse questions for ${set.setName}: ${error.message}`);
        }
      } else {
        throw new Error(`No file provided for set: ${set.setName}`);
      }

      return {
        setName: set.setName,
        timeLimit: parseInt(set.timeLimit),
        isActive: false,
        questions,
        originalFilename: file?.originalname
      };
    })
  );

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
  const hashedStudentPassword = await bcrypt.hash(studentPassword, 10);

  // ✅ FIXED FOR RENDER: Parse ISO string with timezone offset
  // Frontend sends: "2026-01-29T21:52:00.000+05:30" (with timezone offset)
  // Render server is in UTC, but Date constructor handles the offset automatically

  const timezone = data.timezone || 'UTC';

  console.log("📅 Received datetime strings:");
  console.log("Start Time Input:", startTime);
  console.log("End Time Input:", endTime);
  console.log("User Timezone:", timezone);
  console.log("Server Timezone:", process.env.TZ || 'UTC');

  // Parse the ISO strings - they contain timezone offset, so Date will handle it correctly
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error("Invalid date format received");
  }

  console.log("📅 Parsed dates (stored as UTC in MongoDB):");
  console.log("Start Date UTC:", startDate.toISOString());
  console.log("End Date UTC:", endDate.toISOString());

  const event = await Event.create({
    eventName,
    description: description || "",
    adminPassword: hashedAdminPassword,
    studentPassword: hashedStudentPassword,
    startTime: startDate,
    endTime: endDate,
    timezone: timezone,
    sets: eventSets,
    institutionId: institutionId || null,
    targetBatches: targetBatches || data.targetBatches || [],
    targetDepartments: targetDepartments || [],
    isPublic: isPublic === 'true' || isPublic === true,
    visibility: (isPublic === 'true' || isPublic === true) ? 'public' : 'institution',
    marksPerQuestion: parseInt(marksPerQuestion) || 1,
    negativeMarking: parseFloat(negativeMarking) || 0,
    passPercentage: parseInt(passPercentage) || 40,
    maxAttempts: parseInt(maxAttempts) || 1,
    proctoringConfig: proctoringConfig ? (typeof proctoringConfig === 'string' ? JSON.parse(proctoringConfig) : proctoringConfig) : {
      fullscreen: true,
      tabSwitch: true,
      webcam: false,
      randomizeQuestions: true,
      randomizeOptions: true
    },
    createdBy: userId,
    createdByRole: data.createdByRole || "inst-admin" // Fallback if not provided
  });

  console.log(`✅ Event created successfully!`);
  console.log(`   Name: ${eventName}`);
  console.log(`   Timezone: ${timezone}`);
  console.log(`   Start (UTC): ${startDate.toISOString()}`);
  console.log(`   End (UTC): ${endDate.toISOString()}`);
  console.log(`   Sets: ${eventSets.length}`);

  return event;
}


async function studentLogin({
  eventId,
  userId,
  firstName,
  lastName,
  email,
  college,
  department,
  departmentCode,
  rollNo,
  password
}) {
  const event = await Event.findById(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  const now = new Date();

  console.log("🕐 Time Check:");
  console.log("Current time:", now);
  console.log("Event Start:", event.startTime);
  console.log("Event End:", event.endTime);
  console.log("Is before start?", now < event.startTime);
  console.log("Is after end?", now > event.endTime);

  if (now < event.startTime) {
    const waitTime = Math.ceil((event.startTime - now) / 60000);
    const startTimeStr = new Date(event.startTime).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    throw new Error(`Event hasn't started yet. Starts at ${startTimeStr}. Please wait ${waitTime} minutes.`);
  }

  if (now > event.endTime) {
    const endTimeStr = new Date(event.endTime).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    throw new Error(`Event has ended. Ended at ${endTimeStr}.`);
  }

  // Verify password
  const match = await bcrypt.compare(password, event.studentPassword);
  if (!match) {
    throw new Error("Invalid password");
  }

  // ✅ Targeting Check
  if (!event.isPublic) {
    // Check Department
    if (event.targetDepartments && event.targetDepartments.length > 0) {
      if (!event.targetDepartments.includes(department)) {
        throw new Error(`This event is restricted to specific departments. Your department is: ${department}`);
      }
    }

    // Check Batch
    if (event.targetBatches && event.targetBatches.length > 0) {
      const studentBatchId = data.batchId || data.yearId;
      if (!studentBatchId || !event.targetBatches.some(b => b.toString() === studentBatchId.toString())) {
        throw new Error("This event is restricted to specific student batch cohorts.");
      }
    }
  }

  // Check if participant already exists
  let participant = await EventParticipant.findOne({
    eventId: event._id,
    userId
  });

  if (!participant) {
    // Fetch student's batch info from User model
    const studentUser = await User.findOne({ firebaseUid: userId }).populate('batchId');
    const batchId = studentUser ? studentUser.batchId?._id : null;
    const batchName = studentUser ? studentUser.batchId?.batchID : "N/A";

    // Create new participant with all fields
    participant = await EventParticipant.create({
      eventId: event._id,
      userId,
      firstName,
      lastName,
      email,
      college, // MongoDB ObjectId
      department, // Department name (string)
      departmentCode, // Department code (e.g., "CSE")
      rollNo,
      batchId,
      batchName,
      setResults: []
    });

    console.log(`✅ New participant created: ${firstName} ${lastName}`);
  } else {
    console.log(`✅ Existing participant found: ${participant.firstName} ${participant.lastName}`);
  }

  return participant;
}


// ✅ Get questions directly from MongoDB (no file reading)
async function getSetQuestions(setId, eventId) {
  const event = await Event.findById(eventId);
  if (!event) throw new Error("Event not found");

  const set = event.sets.id(setId);
  if (!set) throw new Error("Set not found");

  if (!set.questions || set.questions.length === 0) {
    throw new Error("No questions available for this set");
  }

  console.log(`✅ Retrieved ${set.questions.length} questions from MongoDB`);
  return set.questions;
}

async function startSet(participantId, setId, userId) {
  const participant = await EventParticipant.findById(participantId);

  if (!participant) {
    throw new Error("Participant not found");
  }

  if (participant.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const event = await Event.findById(participant.eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  const set = event.sets.id(setId);

  if (!set) {
    throw new Error("Set not found");
  }

  if (!set.isActive) {
    throw new Error("Set is not active");
  }

  const existingAttempt = participant.setResults.find(
    r => r.setId.toString() === setId && !r.completedAt
  );

  if (existingAttempt) {
    const questions = await getSetQuestions(setId, participant.eventId);
    const now = new Date();
    const timeElapsed = Math.floor((now - existingAttempt.startedAt) / 1000);
    const timeRemaining = Math.max(0, (set.timeLimit * 60) - timeElapsed);

    return {
      message: "Resuming existing session",
      timeLimit: set.timeLimit,
      timeRemaining,
      autoSubmitAt: existingAttempt.autoSubmitAt,
      questions: questions.map(q => ({
        question: q.question,
        options: q.options
      }))
    };
  }

  participant.setResults = participant.setResults.filter(
    r => r.setId.toString() !== setId || !r.completedAt
  );

  const startTime = new Date();
  const autoSubmitAt = new Date(startTime.getTime() + set.timeLimit * 60000);

  participant.setResults.push({
    setId,
    startedAt: startTime,
    completedAt: null,
    score: null,
    autoSubmitAt
  });

  await participant.save();

  const questions = await getSetQuestions(setId, participant.eventId);

  return {
    message: "Set started successfully",
    timeLimit: set.timeLimit,
    timeRemaining: set.timeLimit * 60,
    autoSubmitAt,
    questions: questions.map(q => ({
      question: q.question,
      options: q.options
    }))
  };
}

async function submitSet({ participantId, setId, userId, answers, timeTaken }) {
  console.log('📊 Submit received:', { participantId, setId, timeTaken, answersLength: answers?.length });

  const participant = await EventParticipant.findById(participantId);

  if (!participant || participant.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const resultIndex = participant.setResults.findIndex(
    r => r.setId.toString() === setId && !r.completedAt
  );

  if (resultIndex < 0) {
    throw new Error("Set not started or already completed");
  }

  const event = await Event.findById(participant.eventId);
  const set = event.sets.id(setId);

  const now = new Date();
  const startTime = participant.setResults[resultIndex].startedAt;

  const actualTimeTaken = timeTaken || Math.floor((now - startTime) / 1000);

  const autoSubmitTime = participant.setResults[resultIndex].autoSubmitAt;

  if (now > autoSubmitTime) {
    console.log("⏰ Auto-submitting quiz - time expired");
  }

  const questions = await getSetQuestions(setId, participant.eventId);

  let score = 0;
  let correctCount = 0;
  let wrongAnswers = 0;
  let skipped = 0;
  const results = [];

  questions.forEach((question, index) => {
    const userAnswer = answers[index] || null;
    const isCorrect = userAnswer === question.answer;

    if (userAnswer === null) {
      skipped++;
    } else if (isCorrect) {
      correctCount++;
      score++;
    } else {
      wrongAnswers++;
    }

    results.push({
      question: question.question,
      selectedAnswer: userAnswer,
      answer: question.answer,
      isCorrect
    });
  });

  const percentage = Math.round((score / questions.length) * 100);

  // ✅ Store ALL data including percentage and set name
  participant.setResults[resultIndex].setName = set.setName;
  participant.setResults[resultIndex].score = score;
  participant.setResults[resultIndex].completedAt = now;
  participant.setResults[resultIndex].totalQuestions = questions.length;
  participant.setResults[resultIndex].answers = answers;
  participant.setResults[resultIndex].timeTaken = actualTimeTaken;
  participant.setResults[resultIndex].correctAnswers = correctCount;
  participant.setResults[resultIndex].wrongAnswers = wrongAnswers;
  participant.setResults[resultIndex].skipped = skipped;
  participant.setResults[resultIndex].percentage = percentage;

  await participant.save();

  const timeInMinutes = Math.floor(actualTimeTaken / 60);
  const timeInSeconds = actualTimeTaken % 60;

  console.log(`✅ Quiz submitted: ${score}/${questions.length} (${percentage}%) in ${timeInMinutes}m ${timeInSeconds}s by ${participant.firstName} ${participant.lastName}`);

  return {
    score,
    totalQuestions: questions.length,
    correctAnswers: correctCount,
    wrongAnswers,
    skipped,
    results,
    percentage,
    timeTaken: actualTimeTaken,
    completedAt: now
  };
}

async function toggleSet({ eventId, setId, adminPassword, enable, userId }) {
  const event = await Event.findById(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  if (event.createdBy !== userId) {
    throw new Error("Unauthorized - Only event creator can manage sets");
  }

  const match = await bcrypt.compare(adminPassword, event.adminPassword);
  if (!match) {
    throw new Error("Invalid admin password");
  }

  const targetSet = event.sets.id(setId);
  if (!targetSet) {
    throw new Error("Set not found");
  }

  if (enable) {
    event.sets.forEach(set => {
      set.isActive = false;
    });
    targetSet.isActive = true;
    console.log(`✅ Set "${targetSet.setName}" activated`);
  } else {
    targetSet.isActive = false;
    console.log(`⏸️  Set "${targetSet.setName}" deactivated`);
  }

  await event.save();
  return event;
}

async function deleteEvent(eventId, adminPassword, userId) {
  const event = await Event.findById(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  if (event.createdBy !== userId) {
    throw new Error("Unauthorized - Only event creator can delete");
  }

  const match = await bcrypt.compare(adminPassword, event.adminPassword);
  if (!match) {
    throw new Error("Invalid admin password");
  }

  await EventParticipant.deleteMany({ eventId: event._id });
  await Event.findByIdAndDelete(event._id);

  console.log(`🗑️  Event "${event.eventName}" deleted`);
  return true;
}

async function getEventStats(eventId) {
  const participants = await EventParticipant.find({ eventId });
  const event = await Event.findById(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  let totalParticipants = participants.length;
  let totalSubmissions = 0;
  let above80 = 0;
  let above50 = 0;
  let departmentStats = {};

  participants.forEach(p => {
    if (!departmentStats[p.department]) {
      departmentStats[p.department] = { count: 0, totalScore: 0, submissions: 0 };
    }
    departmentStats[p.department].count++;

    p.setResults.forEach(r => {
      if (r.completedAt && r.score !== null && r.totalQuestions) {
        totalSubmissions++;
        const percentage = (r.score / r.totalQuestions) * 100;

        if (percentage > 80) above80++;
        else if (percentage >= 50 && percentage <= 80) above50++;

        departmentStats[p.department].totalScore += percentage;
        departmentStats[p.department].submissions++;
      }
    });
  });

  Object.keys(departmentStats).forEach(dept => {
    const stats = departmentStats[dept];
    stats.avgScore = stats.submissions > 0
      ? Math.round(stats.totalScore / stats.submissions)
      : 0;
  });

  return {
    eventName: event.eventName,
    totalParticipants,
    totalSubmissions,
    above80,
    above50,
    below50: totalSubmissions - above80 - above50,
    departmentStats,
    sets: event.sets.map(set => ({
      setName: set.setName,
      isActive: set.isActive,
      timeLimit: set.timeLimit,
      questionCount: set.questions?.length || 0
    }))
  };
}

async function checkRemainingTime(participantId, setId, userId) {
  const participant = await EventParticipant.findById(participantId);

  if (!participant || participant.userId !== userId) {
    throw new Error("Unauthorized");
  }

  const result = participant.setResults.find(
    r => r.setId.toString() === setId && !r.completedAt
  );

  if (!result) {
    throw new Error("No active quiz found");
  }

  const now = new Date();
  const remainingMs = result.autoSubmitAt - now;

  return {
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
    autoSubmitAt: result.autoSubmitAt,
    timeUp: remainingMs <= 0
  };
}

async function getEventsByCreator(creatorId, institutionId = null) {
  const query = { createdBy: creatorId };
  if (institutionId) {
    query.institutionId = institutionId;
  }

  return await Event.find(query)
    .select("-adminPassword -studentPassword")
    .sort({ createdAt: -1 });
}

module.exports = {
  createEvent,
  studentLogin,
  startSet,
  submitSet,
  toggleSet,
  deleteEvent,
  getEventStats,
  getSetQuestions,
  checkRemainingTime,
  parseQuestionsFromFile,
  getEventsByCreator
};
