// scripts/generatePracticeSets.js
// Usage:  node generatePracticeSets.js <category>
// Example: node generatePracticeSets.js aptitude
//          node generatePracticeSets.js coding
//
// ⚠️  The category is now taken from the FIRST CLI argument.
//     Nothing is hard-coded — every run targets the category you specify.
//
// The script:
//   • Finds all unique topic+level combos for the given category
//   • Deletes stale practice sets for those combos
//   • Creates new sets of exactly 10 questions each (sequential, stable order)

require("dotenv").config();
const mongoose = require("mongoose");

const QuestionBank = require("../models/QuestionBank");
const PracticeSet  = require("../models/PracticeSet");

// ── CLI argument validation ───────────────────────────────────────────────────
const [,, categoryArg] = process.argv;

const VALID_CATEGORIES = ["aptitude", "reasoning", "coding", "technical"];

if (!categoryArg || !VALID_CATEGORIES.includes(categoryArg.toLowerCase())) {
  console.error(`\n❌ Usage: node generatePracticeSets.js <category>`);
  console.error(`   Valid categories: ${VALID_CATEGORIES.join(", ")}`);
  console.error(`   Example: node generatePracticeSets.js aptitude\n`);
  process.exit(1);
}

const category = categoryArg.toLowerCase();

// ── Per-combo set generation ──────────────────────────────────────────────────
async function generateSets(topic, level) {
  console.log(`\n📚 Processing: ${category} / ${topic} / ${level}`);

  // Remove old sets
  const { deletedCount } = await PracticeSet.deleteMany({ category, topic, level });
  if (deletedCount > 0) {
    console.log(`   🗑️  Deleted ${deletedCount} old set(s)`);
  }

  // Fetch questions in stable insertion order
  const questions = await QuestionBank
    .find({ category, topic, level })
    .sort({ _id: 1 })
    .select("_id");

  if (questions.length < 10) {
    console.log(`   ⚠️  Only ${questions.length} question(s) — need at least 10. Skipping.`);
    return 0;
  }

  const ids = questions.map((q) => q._id);
  let setNumber = 1;

  for (let i = 0; i + 10 <= ids.length; i += 10) {
    await PracticeSet.create({
      category,
      topic,
      level,
      setNumber,
      questions: ids.slice(i, i + 10),
    });
    setNumber++;
  }

  const created = setNumber - 1;
  console.log(`   ✅ Created ${created} set(s)  (${created * 10} of ${questions.length} questions used)`);
  return created;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function generateAllSets() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB Connected");
  console.log(`\n🔍 Scanning category: "${category}" for topic/level combinations...\n`);

  // Discover all distinct topic+level pairs
  const combos = await QuestionBank.aggregate([
    { $match: { category } },
    { $group: { _id: { topic: "$topic", level: "$level" } } },
    { $sort: { "_id.topic": 1, "_id.level": 1 } },
  ]);

  if (combos.length === 0) {
    console.error("❌ No questions found for this category.");
    console.error("   Run loadQuestionBank.js first to populate the question bank.\n");
    process.exit(1);
  }

  console.log(`📋 Found ${combos.length} topic/level combination(s):`);
  combos.forEach(({ _id: { topic, level } }) => console.log(`   • ${topic} / ${level}`));

  let totalSets = 0;

  for (const { _id: { topic, level } } of combos) {
    totalSets += await generateSets(topic, level);
  }

  console.log(`\n🎉 Done! Generated ${totalSets} practice set(s) for category "${category}".\n`);

  await mongoose.disconnect();
  process.exit(0);
}

generateAllSets().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});