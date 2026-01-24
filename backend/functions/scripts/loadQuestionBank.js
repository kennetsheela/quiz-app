require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const QuestionBank = require("../../models/QuestionBank");
const parseStrict = require("../../utils/parseStrict1");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

async function loadQuestions() {
  const category = "coding";  // 🔧 Change this based on your PDF content
  
  const filePath = path.join(__dirname, "../data/coding.pdf");
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`📂 Reading file: ${filePath}\n`);
  
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  const text = data.text;

  console.log(`📄 PDF extracted, text length: ${text.length} characters\n`);

  const questions = parseStrict(text, { category });

  if (questions.length === 0) {
    console.error("\n❌ No questions parsed! Check your PDF format.");
    console.error("Make sure your PDF has topic markers like:");
    console.error("=== TOPIC: percentages, LEVEL: easy ===");
    process.exit(1);
  }

  console.log(`\n💾 Inserting ${questions.length} questions into MongoDB...`);
  
  try {
    await QuestionBank.insertMany(questions);
    console.log(`✅ Successfully inserted ${questions.length} questions!`);
    
    // Show what was loaded
    const breakdown = {};
    questions.forEach(q => {
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
  
  process.exit(0);
}

loadQuestions();