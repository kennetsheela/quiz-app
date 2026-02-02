const express = require("express");
const router = express.Router();
const { verifyToken } = require("./authRoutes");
const PracticeService = require("../services/practiceService");
const PracticeSet = require("../models/PracticeSet");
const QuestionBank = require("../models/QuestionBank");
const PracticeProgress = require("../models/PracticeProgress");

// Get all available practice sets with lock status
router.get("/sets", verifyToken, async (req, res) => {
  try {
    const { category, topic, level } = req.query;
    
    if (!category || !topic || !level) {
      return res.status(400).json({ error: "Category, topic, and level are required" });
    }

    const sets = await PracticeService.getSetsWithLock(
      req.user.uid,
      category,
      topic,
      level
    );

    res.json({ sets });
  } catch (error) {
    console.error("Get sets error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get questions for a specific set
router.get("/sets/:setId/questions", verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    
    if (!setId || setId === 'undefined' || setId === 'null') {
      return res.status(400).json({ 
        error: "Invalid set ID provided",
        receivedId: setId 
      });
    }

    console.log("🔍 Fetching questions for setId:", setId);

    const set = await PracticeSet.findById(setId).populate("questions");

    if (!set) {
      console.log("❌ Set not found with ID:", setId);
      return res.status(404).json({ 
        error: `Practice set not found with ID: ${setId}` 
      });
    }

    console.log("✅ Set found with", set.questions.length, "questions");

    // Remove correct answers from questions
    const questions = set.questions.map(q => ({
      _id: q._id,
      question: q.question,
      options: q.options,
      category: q.category,
      topic: q.topic,
      level: q.level
    }));

    res.json({
      setNumber: set.setNumber,
      timeLimit: set.timeLimit,
      questions,
      totalQuestions: questions.length
    });
  } catch (error) {
    console.error("❌ Get questions error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to fetch questions for the practice set"
    });
  }
});

// Start a practice set
router.post("/sets/start", verifyToken, async (req, res) => {
  try {
    const { category, topic, level, setNumber } = req.body;

    if (!category || !topic || !level || !setNumber) {
      return res.status(400).json({ error: "All fields are required" });
    }

    console.log("🎯 Starting set:", { category, topic, level, setNumber });

    // First find the practice set
    const set = await PracticeSet.findOne({ 
      category, 
      topic, 
      level, 
      setNumber 
    });

    if (!set) {
      console.log("❌ Practice set not found");
      return res.status(404).json({ error: "Practice set not found" });
    }

    console.log("✅ Practice set found:", set._id);

    // Create or update progress with proper initialization
    let progress = await PracticeProgress.findOne({
      userId: req.user.uid,
      category,
      topic,
      level,
      setNumber
    });

    if (!progress) {
      progress = await PracticeProgress.create({
        userId: req.user.uid,
        category,
        topic,
        level,
        setNumber,
        totalQuestions: set.questions.length,
        timeLimit: set.timeLimit,
        startedAt: new Date(),
        completed: false,
        isActive: true
      });
    } else {
      // Reset if restarting
      progress.startedAt = new Date();
      progress.completed = false;
      progress.completedAt = null;
      progress.score = null;
      progress.answers = [];
      progress.isActive = true;
      await progress.save();
    }

    console.log("✅ Progress created/updated:", progress._id);

    res.json({ 
      message: "Set started successfully",
      progress: {
        _id: progress._id.toString(),
        setId: set._id.toString(),
        startedAt: progress.startedAt,
        timeLimit: set.timeLimit,
        totalQuestions: set.questions.length
      }
    });
  } catch (error) {
    console.error("❌ Start set error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ⭐ CORRECTED: Submit a practice set with per-question time tracking
router.post("/sets/submit", verifyToken, async (req, res) => {
  try {
    const { category, topic, level, setNumber, answers, timings } = req.body;

    if (!category || !topic || !level || !setNumber || !answers) {
      return res.status(400).json({ error: "All fields are required" });
    }

    console.log("📝 [Backend] Submitting set:", { 
      category, 
      topic, 
      level, 
      setNumber, 
      answersCount: answers.length,
      hasTimings: !!timings,
      timingsLength: timings ? timings.length : 0
    });
    
    if (timings && timings.length > 0) {
      console.log("⏱️ [Backend] Received per-question timings:", timings);
      console.log("⏱️ [Backend] First timing:", timings[0], "seconds");
      console.log("⏱️ [Backend] Last timing:", timings[timings.length - 1], "seconds");
    } else {
      console.warn("⚠️ [Backend] NO TIMINGS RECEIVED!");
    }

    // Find the practice set to get correct answers
    const set = await PracticeSet.findOne({ 
      category, 
      topic, 
      level, 
      setNumber 
    }).populate("questions");

    if (!set) {
      return res.status(404).json({ error: "Practice set not found" });
    }

    console.log("✅ [Backend] Found set with", set.questions.length, "questions");

    // Find user's progress
    const progress = await PracticeProgress.findOne({
      userId: req.user.uid,
      category,
      topic,
      level,
      setNumber
    });

    if (!progress) {
      return res.status(404).json({ error: "Progress record not found. Please start the set first." });
    }

    // Calculate score and build results
    let score = 0;
    const results = [];

    const normalizeAnswer = (ans) => ans ? ans.toString().trim().toLowerCase() : '';

    set.questions.forEach((question, index) => {
      const userAnswer = answers[index];
      const correctAnswer = question.correctAnswer;
      
      // ⭐ CRITICAL FIX: Get per-question time and ensure it's included in results
      const timeSpent = timings && timings[index] !== undefined && timings[index] !== null 
        ? timings[index] 
        : null;
      
      const isCorrect = userAnswer && 
                       normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
      
      if (isCorrect) {
        score++;
      }
      
      console.log(`[Backend] Q${index + 1}:`, {
        userAnswer: userAnswer?.substring(0, 20),
        correctAnswer: correctAnswer?.substring(0, 20),
        isCorrect,
        timeSpent: timeSpent !== null ? `${timeSpent}s` : 'NULL'
      });
      
      // ⭐ CRITICAL: Ensure timeSpent is ALWAYS included in the result object
      const resultObject = {
        question: question.question,
        questionId: question._id.toString(),
        selectedAnswer: userAnswer || null,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect,
        explanation: question.explanation || null,
        timeSpent: timeSpent  // ⭐ THIS MUST BE HERE!
      };
      
      results.push(resultObject);
    });

    console.log("📊 [Backend] Final score:", score, "/", set.questions.length);
    console.log("📋 [Backend] Results array length:", results.length);
    
    // ⭐ VERIFY: Check that results have timing data
    const resultsWithTime = results.filter(r => r.timeSpent !== null && r.timeSpent !== undefined);
    console.log(`⏱️ [Backend] ${resultsWithTime.length}/${results.length} results have timing data`);
    
    if (resultsWithTime.length > 0) {
      console.log("✅ [Backend] First result with time:", {
        question: results[0].question.substring(0, 30) + "...",
        timeSpent: results[0].timeSpent
      });
    } else {
      console.error("❌ [Backend] NO RESULTS HAVE TIMING DATA! This will break the frontend!");
    }

    // ⭐ Update progress with per-question timing data
    progress.completed = true;
    progress.completedAt = new Date();
    progress.score = score;
    progress.answers = results.map(r => ({
      questionId: r.questionId,
      selectedAnswer: r.selectedAnswer,
      isCorrect: r.isCorrect,
      timeSpent: r.timeSpent // ⭐ Store per-question time in progress
    }));
    progress.isActive = false;
    await progress.save();

    console.log("✅ [Backend] Set submitted successfully. Score:", score, "/", set.questions.length);

    // ⭐ CRITICAL: Build response object with timing data
    const responseObject = {
      success: true,
      message: "Set submitted successfully",
      score,
      totalQuestions: set.questions.length,
      percentage: Math.round((score / set.questions.length) * 100),
      results: results, // ⭐ This MUST include timeSpent for each question
      completedAt: progress.completedAt
    };
    
    // ⭐ FINAL VERIFICATION: Log what we're sending back
    console.log("📤 [Backend] Sending response with", responseObject.results.length, "results");
    console.log("🔍 [Backend] First result being sent:", {
      hasTimeSpent: 'timeSpent' in responseObject.results[0],
      timeSpent: responseObject.results[0].timeSpent,
      keys: Object.keys(responseObject.results[0])
    });

    res.json(responseObject);
  } catch (error) {
    console.error("❌ [Backend] Submit set error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to submit quiz answers"
    });
  }
});

// Get user's progress history for level-up page
router.get("/progress", verifyToken, async (req, res) => {
  try {
    console.log(`📊 Fetching progress for user: ${req.user.uid}`);
    
    const progress = await PracticeProgress.find({ 
      userId: req.user.uid 
    }).sort({ completedAt: -1, startedAt: -1 });

    console.log(`📦 Found ${progress.length} progress records`);

    // Format the response
    const formattedProgress = progress.map(p => {
      const record = {
        _id: p._id,
        category: p.category,
        topic: p.topic,
        level: p.level,
        setNumber: p.setNumber,
        completed: p.completed || false,
        score: p.score || 0,
        totalQuestions: p.totalQuestions || 0,
        answers: p.answers || [],
        startedAt: p.startedAt,
        completedAt: p.completedAt || null,
        timeLimit: p.timeLimit || 10
      };
      
      if (p.completed) {
        console.log(`✅ Completed: ${p.category}-${p.topic} | Score: ${p.score}/${p.totalQuestions}`);
      }
      
      return record;
    });

    console.log(`📊 Returning ${formattedProgress.length} progress records`);
    console.log(`✅ Completed: ${formattedProgress.filter(p => p.completed).length}`);

    res.json({ progress: formattedProgress });
  } catch (error) {
    console.error("❌ Get progress error:", error);
    res.status(500).json({ error: error.message, details: "Failed to fetch progress data" });
  }
});

// Get topics for a category
router.get("/categories/:category/topics", async (req, res) => {
  try {
    const topics = await QuestionBank.distinct("topic", { 
      category: req.params.category 
    });
    res.json({ topics });
  } catch (error) {
    console.error("Get topics error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get levels for a topic
router.get("/topics/:topic/levels", async (req, res) => {
  try {
    const { category } = req.query;
    const levels = await QuestionBank.distinct("level", { 
      category, 
      topic: req.params.topic 
    });
    res.json({ levels });
  } catch (error) {
    console.error("Get levels error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get available categories and topics
router.get("/categories", async (req, res) => {
  try {
    const categories = await QuestionBank.distinct("category");
    const result = [];

    for (const category of categories) {
      const topics = await QuestionBank.distinct("topic", { category });
      result.push({ category, topics });
    }

    res.json({ categories: result });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get custom questions based on multiple criteria
router.post("/custom-questions", verifyToken, async (req, res) => {
  try {
    const { categories, topics, difficulty, questionCount } = req.body;

    console.log("📝 Fetching custom questions:", { categories, topics, difficulty, questionCount });

    // Build query to find questions matching criteria
    const query = {
      category: { $in: categories },
      topic: { $in: topics },
      level: { $in: difficulty }
    };

    // Find all matching questions
    let questions = await QuestionBank.find(query);

    console.log(`✅ Found ${questions.length} matching questions`);

    if (questions.length === 0) {
      return res.status(404).json({ 
        error: "No questions found matching your criteria",
        details: { categories, topics, difficulty }
      });
    }

    // Shuffle questions randomly
    questions = questions.sort(() => Math.random() - 0.5);

    // Limit to requested count
    questions = questions.slice(0, questionCount);

    // Remove correct answers from response
    const questionsWithoutAnswers = questions.map(q => ({
      _id: q._id,
      question: q.question,
      options: q.options,
      category: q.category,
      topic: q.topic,
      level: q.level
    }));

    console.log(`📦 Returning ${questionsWithoutAnswers.length} questions`);

    res.json({
      success: true,
      questions: questionsWithoutAnswers,
      totalFound: questions.length,
      requested: questionCount
    });

  } catch (error) {
    console.error("❌ Custom questions error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to fetch custom questions"
    });
  }
});

// ⭐ CORRECTED: Submit custom quiz with per-question time tracking
router.post("/custom-quiz/submit", verifyToken, async (req, res) => {
  try {
    const { questionIds, answers, timeSpent, timings, quizConfig } = req.body;

    console.log("📝 [Backend] Submitting custom quiz:", { 
      questionCount: questionIds.length, 
      timeSpent,
      hasTimings: !!timings,
      timingsLength: timings ? timings.length : 0
    });

    if (timings && timings.length > 0) {
      console.log("⏱️ [Backend] Received per-question timings:", timings);
    }

    // Fetch questions with correct answers
    const questions = await QuestionBank.find({
      _id: { $in: questionIds }
    });

    // Calculate results
    let score = 0;
    const results = [];

    questions.forEach((question, index) => {
      const userAnswer = answers[index];
      const correctAnswer = question.correctAnswer;
      
      // ⭐ CRITICAL FIX: Get per-question time and ensure it's included in results
      const questionTime = timings && timings[index] !== undefined && timings[index] !== null 
        ? timings[index] 
        : null;
      
      const isCorrect = userAnswer && 
                       userAnswer.toString().trim().toLowerCase() === 
                       correctAnswer.toString().trim().toLowerCase();

      if (isCorrect) score++;

      // ⭐ CRITICAL: Ensure timeSpent is included in result object
      results.push({
        questionId: question._id.toString(),
        question: question.question,
        selectedAnswer: userAnswer || null,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect,
        category: question.category,
        topic: question.topic,
        level: question.level,
        explanation: question.explanation || null,
        timeSpent: questionTime // ⭐ Include per-question time
      });
    });

    const totalQuestions = questions.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    console.log("✅ [Backend] Custom quiz submitted. Score:", score, "/", totalQuestions);
    console.log(`⏱️ [Backend] ${results.filter(r => r.timeSpent !== null).length}/${results.length} results have timing data`);

    res.json({
      success: true,
      score,
      totalQuestions,
      percentage,
      results, // ⭐ Now includes timeSpent for each question
      timeSpent,
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [Backend] Submit custom quiz error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to submit quiz"
    });
  }
});

module.exports = router;