//PracticeRoutes.js 
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

// Submit a practice set with per-question time tracking
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
      console.log("⏱️ [Backend] Total time:", timings.reduce((a, b) => a + b, 0), "seconds");
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
      
      // Get per-question time - CRITICAL: Ensure it's a number or null
      let timeSpent = null;
      if (timings && timings[index] !== undefined && timings[index] !== null) {
        timeSpent = Number(timings[index]);
        if (isNaN(timeSpent)) {
          console.warn(`⚠️ [Backend] Invalid timeSpent for Q${index + 1}:`, timings[index]);
          timeSpent = null;
        }
      }
      
      const isCorrect = userAnswer && 
                       normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
      
      if (isCorrect) {
        score++;
      }
      
      // Build result object with GUARANTEED timeSpent field
      const resultObject = {
        question: question.question,
        questionId: question._id.toString(),
        selectedAnswer: userAnswer || null,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect,
        explanation: question.explanation || null,
        timeSpent: timeSpent  // Will be null or a number, never undefined
      };
      
      results.push(resultObject);
    });

    console.log("📊 [Backend] Final score:", score, "/", set.questions.length);
    
    // Verify timing data in results
    const resultsWithTime = results.filter(r => r.timeSpent !== null && r.timeSpent !== undefined && !isNaN(r.timeSpent));
    console.log(`⏱️ [Backend] ${resultsWithTime.length}/${results.length} results have valid timing data`);
    
    if (resultsWithTime.length > 0) {
      console.log("✅ [Backend] Sample result with time:", {
        question: results[0].question.substring(0, 30) + "...",
        timeSpent: results[0].timeSpent,
        type: typeof results[0].timeSpent
      });
    } else {
      console.warn("⚠️ [Backend] NO RESULTS HAVE TIMING DATA!");
    }

    // Update progress with per-question timing data
    progress.completed = true;
    progress.completedAt = new Date();
    progress.score = score;
    progress.answers = results.map(r => ({
      questionId: r.questionId,
      selectedAnswer: r.selectedAnswer,
      isCorrect: r.isCorrect,
      timeSpent: r.timeSpent
    }));
    progress.isActive = false;
    await progress.save();

    console.log("✅ [Backend] Progress saved to database");

    // Build response object
    const responseObject = {
      success: true,
      message: "Set submitted successfully",
      score,
      totalQuestions: set.questions.length,
      percentage: Math.round((score / set.questions.length) * 100),
      results: results,
      completedAt: progress.completedAt
    };
    
    // FINAL VERIFICATION before sending
    console.log("📤 [Backend] Response summary:");
    console.log("   - Results count:", responseObject.results.length);
    console.log("   - First result has timeSpent:", 'timeSpent' in responseObject.results[0]);
    console.log("   - First result timeSpent value:", responseObject.results[0].timeSpent);
    console.log("   - First result timeSpent type:", typeof responseObject.results[0].timeSpent);

    res.json(responseObject);
  } catch (error) {
    console.error("❌ [Backend] Submit set error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to submit quiz answers"
    });
  }
});

// Get user's progress history
router.get("/progress", verifyToken, async (req, res) => {
  try {
    console.log(`📊 Fetching progress for user: ${req.user.uid}`);
    
    const progress = await PracticeProgress.find({ 
      userId: req.user.uid 
    }).sort({ completedAt: -1, startedAt: -1 });

    console.log(`📦 Found ${progress.length} progress records`);

    // Format the response with timing data preserved
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
        
        // Check if timing data exists
        const hasTimings = p.answers && p.answers.some(a => 
          a.timeSpent !== null && a.timeSpent !== undefined && !isNaN(a.timeSpent)
        );
        console.log(`⏱️ Has timing data: ${hasTimings}`);
      }
      
      return record;
    });

    console.log(`📊 Returning ${formattedProgress.length} progress records`);

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

// Submit custom quiz with per-question time tracking
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
      
      // Get per-question time
      let questionTime = null;
      if (timings && timings[index] !== undefined && timings[index] !== null) {
        questionTime = Number(timings[index]);
        if (isNaN(questionTime)) {
          questionTime = null;
        }
      }
      
      const isCorrect = userAnswer && 
                       userAnswer.toString().trim().toLowerCase() === 
                       correctAnswer.toString().trim().toLowerCase();

      if (isCorrect) score++;

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
        timeSpent: questionTime
      });
    });

    const totalQuestions = questions.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    console.log("✅ [Backend] Custom quiz submitted. Score:", score, "/", totalQuestions);
    
    const resultsWithTime = results.filter(r => r.timeSpent !== null && !isNaN(r.timeSpent));
    console.log(`⏱️ [Backend] ${resultsWithTime.length}/${results.length} results have timing data`);

    res.json({
      success: true,
      score,
      totalQuestions,
      percentage,
      results,
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