// testQuestionsFile.js
// Save in backend/ and run: node testQuestionsFile.js

const mammoth = require("mammoth");
const path = require("path");
const parseStrict = require("./utils/parseStrict");

// Replace with your actual filename
const filename = "Aptitude.docx";
const filePath = path.join(__dirname, "uploads", filename);

async function testFile() {
  try {
    console.log("═".repeat(70));
    console.log("🔍 TESTING QUESTIONS FILE");
    console.log("═".repeat(70));
    console.log("\n📁 File:", filename);
    console.log("📂 Path:", filePath);
    
    // Check if file exists
    const fs = require("fs");
    if (!fs.existsSync(filePath)) {
      console.error("\n❌ File not found at:", filePath);
      console.log("\n📋 Files in uploads folder:");
      const files = fs.readdirSync(path.join(__dirname, "uploads"));
      files.forEach(f => console.log(`   - ${f}`));
      process.exit(1);
    }
    
    console.log("✅ File exists\n");
    
    // Extract text
    console.log("📄 Extracting text from DOCX...");
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    
    console.log("✅ Extracted text, length:", text.length, "characters\n");
    
    // Show raw text
    console.log("═".repeat(70));
    console.log("RAW TEXT CONTENT (First 1000 chars):");
    console.log("═".repeat(70));
    console.log(text.substring(0, 1000));
    console.log("═".repeat(70));
    console.log("\n");
    
    // Try to parse
    console.log("═".repeat(70));
    console.log("PARSING QUESTIONS:");
    console.log("═".repeat(70));
    const questions = parseStrict(text);
    
    console.log("\n");
    console.log("═".repeat(70));
    console.log("RESULTS:");
    console.log("═".repeat(70));
    console.log(`✅ Successfully parsed ${questions.length} questions\n`);
    
    if (questions.length > 0) {
      console.log("📝 Sample question:");
      console.log(JSON.stringify(questions[0], null, 2));
      console.log("\n");
      
      // Show all questions summary
      console.log("📋 All questions summary:");
      questions.forEach((q, i) => {
        console.log(`\n${i + 1}. ${q.question.substring(0, 60)}...`);
        q.options.forEach((opt, j) => {
          const isCorrect = opt === q.correctAnswer ? " ✓" : "";
          console.log(`   ${String.fromCharCode(65 + j)}. ${opt.substring(0, 50)}${isCorrect}`);
        });
      });
      
      console.log("\n");
      console.log("═".repeat(70));
      console.log("🎉 SUCCESS! Questions parsed correctly!");
      console.log("═".repeat(70));
      console.log("\nYour quiz should work now. Try:");
      console.log("1. Make sure parseStrict.js is updated");
      console.log("2. Restart backend");
      console.log("3. Activate the quiz in admin panel");
      console.log("4. Test the quiz\n");
      
    } else {
      console.log("═".repeat(70));
      console.log("❌ NO QUESTIONS PARSED");
      console.log("═".repeat(70));
      console.log("\n📝 Your questions file format might not match the parser.");
      console.log("\n✅ Expected format:");
      console.log(`
1. What is 2+2?
A. 2
B. 3
C. 4
D. 5
Answer: C

2. What is the capital of France?
A. London
B. Paris
C. Berlin
D. Rome
Answer: B
      `);
      console.log("\n💡 Please:");
      console.log("1. Check the 'RAW TEXT CONTENT' above");
      console.log("2. Make sure your questions follow one of the supported formats");
      console.log("3. Each question needs exactly 4 options (A, B, C, D)");
      console.log("4. Each question needs an answer line (Answer: X)\n");
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testFile();