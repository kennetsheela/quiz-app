//practiceService.js
const PracticeSet = require("../models/PracticeSet");
const PracticeProgress = require("../models/PracticeProgress");
const QuestionBank = require("../models/QuestionBank");

async function getSetsWithLock(userId, category, topic, level) {
  const sets = await PracticeSet.find({ category, topic, level })
    .sort({ setNumber: 1 });
  
  const progress = await PracticeProgress.find({ 
    userId, 
    category, 
    topic, 
    level 
  });

  return sets.map((set, index) => {
    const completed = progress.find(
      p => p.setNumber === set.setNumber && p.completed
    );

    const previousCompleted = index === 0 || progress.find(
      p => p.setNumber === sets[index - 1].setNumber && p.completed
    );

    return {
      _id: set._id,
      setNumber: set.setNumber,
      timeLimit: set.timeLimit,
      questionCount: set.questions.length,
      completed: !!completed,
      locked: index > 0 && !previousCompleted,
      score: completed ? completed.score : null,
      completedAt: completed ? completed.completedAt : null
    };
  });
}

async function startSet({ userId, category, topic, level, setNumber }) {
  const set = await PracticeSet.findOne({ 
    category, 
    topic, 
    level, 
    setNumber 
  });

  if (!set) {
    throw new Error("Practice set not found");
  }

  // Check if previous set is completed (for locked sets)
  if (setNumber > 1) {
    const previousProgress = await PracticeProgress.findOne({
      userId,
      category,
      topic,
      level,
      setNumber: setNumber - 1,
      completed: true
    });

    if (!previousProgress) {
      throw new Error("Complete the previous set first");
    }
  }

  const progress = await PracticeProgress.findOneAndUpdate(
    { userId, category, topic, level, setNumber },
    {
      startedAt: new Date(),
      completed: false,
      score: null,
      completedAt: null,
      totalQuestions: set.questions.length,
      answers: []
    },
    {
      upsert: true,
      new: true
    }
  );

  return progress;
}

async function submitSet({ userId, category, topic, level, setNumber, answers, timings }) {
  const progress = await PracticeProgress.findOne({
    userId,
    category,
    topic,
    level,
    setNumber
  });

  if (!progress) {
    throw new Error("Set not started");
  }

  if (progress.completed) {
    throw new Error("Set already completed");
  }

  const set = await PracticeSet.findOne({ 
    category, 
    topic, 
    level, 
    setNumber 
  }).populate("questions");

  if (!set) {
    throw new Error("Practice set not found");
  }

  // Check time limit
  const elapsedMinutes = (new Date() - progress.startedAt) / 60000;
  if (elapsedMinutes > set.timeLimit) {
    throw new Error("Time limit exceeded");
  }

  // Log timing data
  if (timings && timings.length > 0) {
    console.log("⏱️ [PracticeService] Received per-question timings:", timings);
    console.log("⏱️ [PracticeService] Total time:", timings.reduce((sum, t) => sum + (t || 0), 0), "seconds");
  } else {
    console.log("⚠️ [PracticeService] No timing data received");
  }

  // Calculate score
  let score = 0;
  const results = [];

  set.questions.forEach((question, index) => {
    const userAnswer = answers[index];
    const isCorrect = userAnswer === question.correctAnswer;
    
    // Get per-question time with validation
    let timeSpent = null;
    if (timings && timings[index] !== undefined && timings[index] !== null) {
      timeSpent = Number(timings[index]);
      if (isNaN(timeSpent)) {
        console.warn(`⚠️ [PracticeService] Invalid timeSpent for Q${index + 1}`);
        timeSpent = null;
      }
    }
    
    if (isCorrect) score++;

    results.push({
      questionId: question._id,
      question: question.question,
      selectedAnswer: userAnswer,
      correctAnswer: question.correctAnswer,
      isCorrect,
      explanation: question.explanation,
      timeSpent: timeSpent
    });
  });

  // Update progress with per-question timing data
  progress.completed = true;
  progress.score = score;
  progress.completedAt = new Date();
  progress.answers = results.map(r => ({
    questionId: r.questionId,
    selectedAnswer: r.selectedAnswer,
    isCorrect: r.isCorrect,
    timeSpent: r.timeSpent
  }));

  await progress.save();

  console.log("✅ [PracticeService] Progress saved with timing data");

  return {
    score,
    totalQuestions: set.questions.length,
    results,
    completedAt: progress.completedAt
  };
}

async function getUserProgress(userId) {
  const progress = await PracticeProgress.find({ userId })
    .sort({ completedAt: -1 })
    .limit(50);

  return progress;
}

module.exports = {
  getSetsWithLock,
  startSet,
  submitSet,
  getUserProgress
};