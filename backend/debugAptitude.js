// ============================================
// DEBUG SCRIPT: Check Aptitude Questions
// File: debugAptitude.js
// ============================================
require("dotenv").config();
const mongoose = require("mongoose");
const QuestionBank = require("./models/QuestionBank");
const PracticeSet = require("./models/PracticeSet");

mongoose.connect(process.env.MONGO_URI);

async function debugAptitude() {
  try {
    console.log("\n🔍 DEBUGGING APTITUDE CATEGORY\n");
    
    // 1. Check all categories in database
    const allCategories = await QuestionBank.distinct("category");
    console.log("📋 All Categories in DB:", allCategories);
    
    // 2. Check questions for "aptitude" (exact match)
    const aptitudeQuestions = await QuestionBank.find({ category: "aptitude" });
    console.log("\n📝 Aptitude Questions (exact match):", aptitudeQuestions.length);
    
    // 3. Check for case sensitivity issues
    const aptitudeLower = await QuestionBank.find({ category: /^aptitude$/i });
    console.log("📝 Aptitude Questions (case insensitive):", aptitudeLower.length);
    
    // 4. Check all questions with "apt" in category name
    const aptPattern = await QuestionBank.find({ category: /apt/i });
    console.log("📝 Questions with 'apt' in category:", aptPattern.length);
    
    // 5. Show sample questions to see actual category value
    const sampleQuestions = await QuestionBank.find().limit(5);
    console.log("\n📋 Sample Questions:");
    sampleQuestions.forEach(q => {
      console.log(`  - Category: "${q.category}", Topic: "${q.topic}", Level: "${q.level}"`);
    });
    
    // 6. Check topics in aptitude
    const aptitudeTopics = await QuestionBank.distinct("topic", { category: "aptitude" });
    console.log("\n📚 Topics in Aptitude:", aptitudeTopics);
    
    // 7. Check practice sets for aptitude
    const aptitudeSets = await PracticeSet.find({ category: "aptitude" });
    console.log("\n📦 Aptitude Practice Sets:", aptitudeSets.length);
    
    if (aptitudeSets.length > 0) {
      console.log("\n✅ Sample Aptitude Set:");
      const sampleSet = aptitudeSets[0];
      console.log(`  - ID: ${sampleSet._id}`);
      console.log(`  - Topic: ${sampleSet.topic}`);
      console.log(`  - Level: ${sampleSet.level}`);
      console.log(`  - Set Number: ${sampleSet.setNumber}`);
      console.log(`  - Questions Count: ${sampleSet.questions.length}`);
      
      // Check if questions are populated correctly
      const populatedSet = await PracticeSet.findById(sampleSet._id).populate("questions");
      console.log(`  - Populated Questions: ${populatedSet.questions.length}`);
      
      if (populatedSet.questions.length === 0) {
        console.log("\n❌ WARNING: Set has no populated questions!");
        console.log("   Question IDs in set:", sampleSet.questions);
        
        // Check if those question IDs exist
        for (let qId of sampleSet.questions.slice(0, 3)) {
          const questionExists = await QuestionBank.findById(qId);
          console.log(`   - Question ${qId} exists:`, !!questionExists);
        }
      }
    } else {
      console.log("\n❌ No practice sets found for aptitude category!");
    }
    
    // 8. Check for specific test case
    console.log("\n🧪 Testing specific query:");
    const testSet = await PracticeSet.findOne({
      category: "aptitude",
      topic: "percentages",
      level: "easy",
      setNumber: 1
    });
    
    if (testSet) {
      console.log("✅ Test set found:", testSet._id);
      const withQuestions = await PracticeSet.findById(testSet._id).populate("questions");
      console.log("   Questions in set:", withQuestions.questions.length);
    } else {
      console.log("❌ Test set NOT found");
      
      // Try case-insensitive search
      const testSetCaseInsensitive = await PracticeSet.findOne({
        category: /^aptitude$/i,
        topic: /^percentages$/i,
        level: /^easy$/i,
        setNumber: 1
      });
      
      if (testSetCaseInsensitive) {
        console.log("✅ Found with case-insensitive search!");
        console.log(`   Actual values: category="${testSetCaseInsensitive.category}", topic="${testSetCaseInsensitive.topic}"`);
      }
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

debugAptitude();

// ============================================
// FIX SCRIPT: Regenerate Aptitude Sets
// File: fixAptitudeSets.js
// ============================================
