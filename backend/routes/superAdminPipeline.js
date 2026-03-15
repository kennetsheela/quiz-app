// routes/superAdminPipeline.js
// Drop-in Express router — mount at /api/super-admin
// POST /api/super-admin/questions/pipeline
//
// Orchestrates the full question pipeline:
//   1. Parse uploaded PDF/DOCX with parseStrict
//   2. Load parsed questions into QuestionBank (MongoDB)
//   3. Generate PracticeSets from loaded questions
//
// The CATEGORY comes from the multipart form field, so every upload
// correctly targets the chosen category — nothing is hardcoded.

const express = require("express");
const router = express.Router();
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const mongoose = require("mongoose");
const { verifySuperAdmin } = require("./superAdminRoutes");

// ─── Models ──────────────────────────────────────────────────────────────────
const QuestionBank = require("../models/QuestionBank");
const PracticeSet = require("../models/PracticeSet");

// ─── Parser ──────────────────────────────────────────────────────────────────
const parseStrict = require("../utils/parseStrict1");

// ─── Multer (memory storage — no temp files needed) ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are supported"), false);
    }
  },
});

// ─── Helper: extract raw text from buffer ────────────────────────────────────
async function extractText(buffer, mimetype) {
  if (mimetype === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  }

  // DOCX / DOC
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ─── Helper: generate practice sets for a category ──────────────────────────
async function generatePracticeSets(category) {
  console.log(`\n⚙️  Generating practice sets for category: ${category}`);

  // Find all unique topic+level combinations in this category
  const combos = await QuestionBank.aggregate([
    { $match: { category } },
    { $group: { _id: { topic: "$topic", level: "$level" } } },
  ]);

  if (combos.length === 0) {
    console.warn("⚠️  No topic/level combinations found — skipping set generation.");
    return 0;
  }

  let totalSets = 0;

  for (const { _id: { topic, level } } of combos) {
    // Remove stale sets
    const { deletedCount } = await PracticeSet.deleteMany({ category, topic, level });
    if (deletedCount > 0) {
      console.log(`   🗑️  Removed ${deletedCount} old set(s) for ${topic}/${level}`);
    }

    // Fetch all questions for this combo in a stable order
    const questions = await QuestionBank
      .find({ category, topic, level })
      .sort({ _id: 1 })
      .select("_id");

    if (questions.length < 10) {
      console.log(`   ⚠️  ${topic}/${level}: only ${questions.length} questions (need ≥10), skipping`);
      continue;
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
    totalSets += created;
    console.log(`   ✅ ${topic}/${level}: created ${created} set(s)`);
  }

  return totalSets;
}

// ─── POST /questions/pipeline ─────────────────────────────────────────────────
router.use(verifySuperAdmin); // Protect all pipeline routes

router.post(
  "/questions/pipeline",
  upload.single("file"),
  async (req, res) => {
    const startTime = Date.now();

    try {
      // ── Validate inputs ──────────────────────────────────────────────────
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const category = (req.body.category || "").trim().toLowerCase();
      if (!category) {
        return res.status(400).json({ error: "Category is required" });
      }

      const validCategories = ["aptitude", "reasoning", "coding", "technical"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
        });
      }

      console.log(`\n🚀 Pipeline started — category: ${category}, file: ${req.file.originalname}`);

      // ── Step 1: Parse ────────────────────────────────────────────────────
      console.log("\n📄 Step 1/3: Parsing file...");
      const rawText = await extractText(req.file.buffer, req.file.mimetype);

      if (!rawText || rawText.trim().length < 50) {
        return res.status(422).json({
          error: "Could not extract readable text from the uploaded file. Make sure it is not scanned/image-only.",
        });
      }

      console.log(`   Extracted ${rawText.length} characters of text`);

      // Pass category to parser so topic markers inherit it
      const parsed = parseStrict(rawText, { category });
      const parsedCount = parsed.length;

      if (parsedCount === 0) {
        return res.status(422).json({
          error:
            "No questions could be parsed. Ensure your file uses the required format:\n" +
            "=== TOPIC: topic-name, LEVEL: easy|medium|hard ===\n" +
            "1. Question text\nA. Option\nB. Option\nC. Option\nD. Option\nAnswer: A",
        });
      }

      console.log(`   ✅ Parsed ${parsedCount} questions`);

      // ── Step 2: Load into DB ─────────────────────────────────────────────
      console.log("\n💾 Step 2/3: Loading questions into database...");

      // Deduplicate: avoid inserting questions that already exist
      // (simple check: same question text + category + topic + level)
      const existingTexts = new Set(
        (
          await QuestionBank.find(
            { category },
            { question: 1 }
          ).lean()
        ).map((q) => q.question.trim().toLowerCase())
      );

      // Deduplicate within the uploaded file itself first
      const uniqueInBatch = [];
      const batchSeen = new Set();

      for (const q of parsed) {
        const text = (q.question || "").trim().toLowerCase();
        if (!batchSeen.has(text)) {
          batchSeen.add(text);
          uniqueInBatch.push(q);
        } else {
          console.warn(`⚠️ Skipping duplicate question within file: "${text.substring(0, 50)}..."`);
        }
      }

      // Filter against database existing questions
      const freshQuestions = uniqueInBatch
        .filter(q => {
          const hasAnswer = q.answer !== null && q.answer !== undefined && String(q.answer).trim() !== "";
          if (!hasAnswer && q.question) {
            console.warn(`⚠️ Skipping question without valid answer: "${q.question.substring(0, 50)}..."`);
          }
          return hasAnswer;
        })
        .filter(q => !existingTexts.has((q.question || "").trim().toLowerCase()));

      const duplicateCount = parsedCount - freshQuestions.length;

      let loadedCount = 0;
      if (freshQuestions.length > 0) {
        console.log(`   Filtered to ${freshQuestions.length} fresh questions for insertion`);

        // MANUALLY GENERATE QuestionIDs to avoid Mongo race conditions/hooks issues
        const currentTotal = await QuestionBank.countDocuments();
        const fresh = freshQuestions.map((q, index) => ({
          ...q,
          questionID: `Q${String(currentTotal + index + 1).padStart(3, '0')}`,
          createdBy: "super-admin"
        }));

        try {
          const result = await QuestionBank.insertMany(fresh, { ordered: false });
          loadedCount = result.length;
        } catch (insertErr) {
          loadedCount = insertErr.insertedDocs?.length || 0;
          console.error(`   Partial insertion error: ${insertErr.message}`);
          throw insertErr;
        }
      }

      console.log(`   ✅ Inserted ${loadedCount} new questions (${parsedCount - loadedCount} duplicates skipped)`);

      // ── Step 3: Generate practice sets ──────────────────────────────────
      console.log("\n📚 Step 3/3: Generating practice sets...");
      const setsGenerated = await generatePracticeSets(category);
      console.log(`   ✅ Generated ${setsGenerated} practice set(s)`);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n🎉 Pipeline complete in ${elapsed}s`);

      return res.json({
        status: "success",
        category: category,
        parsedCount: Number(parsedCount),
        loadedCount: Number(loadedCount),
        duplicateCount: Number(duplicateCount),
        setsGenerated: Number(setsGenerated),
        elapsed: `${elapsed}s`,
      });
    } catch (err) {
      console.error("❌ Pipeline error:", err);
      return res.status(500).json({
        error: err.message || "Pipeline execution failed",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }
);

module.exports = router;
