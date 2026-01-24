const PracticeSet = require("../models/PracticeSet");
const practiceService = require("../services/practiceService");

exports.getSetsWithLock = async (req, res) => {
  try {
    const result = await practiceService.getSetsWithLock(
      req.query.userId,
      req.query.category,
      req.query.topic,
      req.query.level
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.loadSet = async (req, res) => {
  const { category, topic, level, setNumber } = req.query;

  const set = await PracticeSet.findOne({ category, topic, level, setNumber })
    .populate("questions", "-correctAnswer");

  if (!set) return res.status(404).json({ error: "Set not found" });

  res.json({ questions: set.questions, timeLimit: set.timeLimit });
};

exports.startSet = async (req, res) => {
  try {
    const progress = await practiceService.startSet(req.body);
    res.json({ message: "Set started", startedAt: progress.startedAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.submitSet = async (req, res) => {
  try {
    await practiceService.submitSet(req.body);
    res.json({ message: "Set completed successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
