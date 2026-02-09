//practice.js
const express = require("express");
const router = express.Router();
const PracticeSet = require("../models/PracticeSet");
const QuestionBank = require("../models/QuestionBank");
const auth = require("../middleware/auth");

// Get practice sets with optional filters
router.get("/sets", auth, async (req, res) => {
  try {
    const { category, topic, level } = req.query;
    
    const filter = {};
    if (category) filter.category = category;
    if (topic) filter.topic = topic;
    if (level) filter.level = level;

    const sets = await PracticeSet.find(filter)
      .sort({ category: 1, topic: 1, level: 1, setNumber: 1 });

    res.json({ sets });
  } catch (error) {
    console.error("Error fetching practice sets:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get a specific practice set with questions
router.get("/set/:id", auth, async (req, res) => {
  try {
    const set = await PracticeSet.findById(req.params.id)
      .populate("questions");

    if (!set) {
      return res.status(404).json({ message: "Practice set not found" });
    }

    res.json({ set });
  } catch (error) {
    console.error("Error fetching practice set:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get unique categories
router.get("/categories", auth, async (req, res) => {
  try {
    const categories = await PracticeSet.distinct("category");
    res.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get topics for a category
router.get("/topics/:category", auth, async (req, res) => {
  try {
    const topics = await PracticeSet.distinct("topic", {
      category: req.params.category
    });
    res.json({ topics });
  } catch (error) {
    console.error("Error fetching topics:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;