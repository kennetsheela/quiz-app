// scripts/loadQuestionBank.js
// Usage:  node loadQuestionBank.js <category> <path-to-file>
// Example: node loadQuestionBank.js aptitude ./data/aptitude.pdf
//          node loadQuestionBank.js coding   ./data/coding.docx
//
// ⚠️  The category is now taken from the FIRST CLI argument.
//     Nothing is hard-coded — every run targets the category you specify.

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const QuestionBank = require("../models/QuestionBank");
const parseStrict = require("../utils/parseStrict1");

// ── CLI argument validation ───────────────────────────────────────────────────
const [, , categoryArg, filePathArg] = process.argv;

const VALID_CATEGORIES = ["aptitude", "reasoning", "coding", "technical"];

if (!categoryArg || !VALID_CATEGORIES.includes(categoryArg.toLowerCase())) {
  console.error(`\n❌ Usage: node loadQuestionBank.js <category> <file-path>`);
  console.error(`   Valid categories: ${VALID_CATEGORIES.join(", ")}`);
  console.error(`   Example: node loadQuestionBank.js aptitude ./data/aptitude.pdf\n`);
  process.exit(1);
}

if (!filePathArg) {
  console.error(`\n❌ Please provide the path to the PDF or DOCX file.`);
  console.error(`   Example: node loadQuestionBank.js aptitude ./data/aptitude.pdf\n`);
  process.exit(1);
}

const category = categoryArg.toLowerCase();
const filePath = path.resolve(filePathArg);

if (!fs.existsSync(filePath)) {
  console.error(`\n❌ File not found: ${filePath}\n`);
  process.exit(1);
}

// ── Extract text from PDF or DOCX ────────────────────────────────────────────
async function extractText(fp) {
  const ext = path.extname(fp).toLowerCase();
  const buffer = fs.readFileSync(fp);

  if (ext === ".pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === ".docx" || ext === ".doc") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}. Use .pdf or .docx`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function loadQuestions() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB Connected");

  console.log(`\n📂 File     : ${filePath}`);
  console.log(`📦 Category : ${category}\n`);

  const rawText = await extractText(filePath);

  if (!rawText || rawText.trim().length < 50) {
    console.error("\n❌ Could not extract readable text from the file.");
    console.error("   Make sure it is not a scanned / image-only document.\n");
    process.exit(1);
  }

  console.log(`📄 Extracted ${rawText.length} characters\n`);

  // Parse — category is injected so topic markers inherit it
  const questions = parseStrict(rawText, { category });

  if (questions.length === 0) {
    console.error("\n❌ No questions parsed! Check your file format.");
    console.error("   Each section must start with:");
    console.error("   === TOPIC: <topic-name>, LEVEL: easy|medium|hard ===\n");
    process.exit(1);
  }

  console.log(`\n💾 Inserting ${questions.length} questions into MongoDB...`);

  const fresh = questions
    .filter(q => {
      const hasAnswer = q.answer !== null && q.answer !== undefined && String(q.answer).trim() !== "";
      if (!hasAnswer && q.question) {
        console.warn(`⚠️ Skipping question without valid answer: "${q.question.substring(0, 50)}..."`);
      }
      return hasAnswer;
    })
    .map(q => ({
      ...q,
      createdBy: "admin-cli" // Required field
    }));

  if (fresh.length === 0) {
    console.error("❌ No valid questions (with non-empty answers) to insert.");
    process.exit(1);
  }

  try {
    await QuestionBank.insertMany(fresh, { ordered: false });
    console.log(`✅ Successfully inserted ${fresh.length} questions!`);

    // Summary breakdown
    const breakdown = {};
    questions.forEach((q) => {
      const key = `${q.topic}/${q.level}`;
      breakdown[key] = (breakdown[key] || 0) + 1;
    });

    console.log("\n📦 Loaded questions breakdown:");
    Object.entries(breakdown).forEach(([key, count]) => {
      console.log(`   ✓ ${key}: ${count} questions`);
    });
  } catch (error) {
    console.error("❌ Error inserting questions:", error.message);
    process.exit(1);
  }

  await mongoose.disconnect();
  process.exit(0);
}

loadQuestions().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});