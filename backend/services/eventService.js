const Event = require("../models/Event");
const EventParticipant = require("../models/EventParticipant");
const bcrypt = require("bcrypt");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const parseStrict = require("../utils/parseStrict");

// ✅ Parse questions from file buffer and store in MongoDB
async function parseQuestionsFromFile(file) {
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

    // Parse questions using your existing parser
    const questions = parseStrict(textContent);
    
    if (questions.length === 0) {
      console.error("❌ No questions parsed from text:", textContent.substring(0, 500));
      throw new Error("No valid questions found in file");
    }

    console.log(`✅ Successfully parsed ${questions.length} questions`);
    return questions;
    
  } catch (error) {
    console.error("❌ Question parsing error:", error);
    throw new Error(`Failed to parse questions: ${error.message}`);
  }
}

// ✅ Create event with questions stored in MongoDB - NO timezone conversion
async function createEvent(data, files, userId) {
  const { eventName, adminPassword, studentPassword, startTime, endTime, sets } = data;

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

  // ✅ NO TIMEZONE CONVERSION - Store exactly as entered
  // Input: "2026-01-28T12:00" → Store as: "2026-01-28T12:00:00.000Z"
  // Add seconds and Z to make it a valid ISO string
  const startDate = new Date(startTime + ':00.000Z');
  const endDate = new Date(endTime + ':00.000Z');
  
  console.log("📅 Creating event with times:");
  console.log("Input start time:", startTime);
  console.log("Input end time:", endTime);
  console.log("Stored Start:", startDate.toISOString());
  console.log("Stored End:", endDate.toISOString());

  const event = await Event.create({
    eventName,
    adminPassword: hashedAdminPassword,
    studentPassword: hashedStudentPassword,
    startTime: startDate,
    endTime: endDate,
    sets: eventSets,
    createdBy: userId
  });

  console.log(`✅ Event created with ${eventSets.length} sets`);
  return event;
}

async function studentLogin({ eventId, userId, rollNo, department, password }) {
  const event = await Event.findById(eventId);
  
  if (!event) {
    throw new Error("Event not found");
  }

  const now = new Date();
  
  console.log("🕐 Time Check:");
  console.log("Current time:", now.toISOString());
  console.log("Event Start:", event.startTime.toISOString());
  console.log("Event End:", event.endTime.toISOString());
  console.log("Is before start?", now < event.startTime);
  console.log("Is after end?", now > event.endTime);
  
  if (now < event.startTime) {
    const waitTime = Math.ceil((event.startTime - now) / 60000); // minutes
    const startTimeStr = event.startTime.toISOString().replace('T', ' ').substring(0, 16);
    throw new Error(`Event hasn't started yet. Starts at ${startTimeStr}. Please wait ${waitTime} minutes.`);
  }
  
  if (now > event.endTime) {
    const endTimeStr = event.endTime.toISOString().replace('T', ' ').substring(0, 16);
    throw new Error(`Event has ended. Ended at ${endTimeStr}.`);
  }

  const match = await bcrypt.compare(password, event.studentPassword);
  if (!match) {
    throw new Error("Invalid password");
  }

  let participant = await EventParticipant.findOne({
    eventId: event._id,
    userId
  });

  if (!participant) {
    participant = await EventParticipant.create({
      eventId: event._id,
      userId,
      rollNo,
      department,
      setResults: []
    });
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

async function submitSet({ participantId, setId, userId, answers }) {
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
  const autoSubmitTime = participant.setResults[resultIndex].autoSubmitAt;
  
  if (now > autoSubmitTime) {
    console.log("⏰ Auto-submitting quiz - time expired");
  }

  const questions = await getSetQuestions(setId, participant.eventId);
  
  let score = 0;
  const results = [];
  
  questions.forEach((question, index) => {
    const userAnswer = answers[index] || null;
    const isCorrect = userAnswer === question.correctAnswer;
    
    if (isCorrect) score++;
    
    results.push({
      question: question.question,
      selectedAnswer: userAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect
    });
  });

  participant.setResults[resultIndex].score = score;
  participant.setResults[resultIndex].completedAt = now;
  participant.setResults[resultIndex].totalQuestions = questions.length;
  participant.setResults[resultIndex].answers = answers;

  await participant.save();

  console.log(`✅ Quiz submitted: ${score}/${questions.length} by user ${userId}`);

  return { 
    score, 
    totalQuestions: questions.length, 
    results,
    percentage: Math.round((score / questions.length) * 100)
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
        
        if (percentage >= 80) above80++;
        else if (percentage >= 50) above50++;

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

module.exports = {
  createEvent,
  studentLogin,
  startSet,
  submitSet,
  toggleSet,
  deleteEvent,
  getEventStats,
  getSetQuestions,
  checkRemainingTime
};
