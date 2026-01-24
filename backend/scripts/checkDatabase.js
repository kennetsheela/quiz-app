require("dotenv").config();
const mongoose = require("mongoose");
const QuestionBank = require("../models/QuestionBank");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

async function checkDatabase() {
  console.log("\n🔍 DATABASE DIAGNOSTIC\n");
  console.log("=" .repeat(50));
  
  // 1. Total count
  const total = await QuestionBank.countDocuments({});
  console.log(`\n📊 Total questions in QuestionBank: ${total}`);
  
  if (total === 0) {
    console.log("❌ Database is empty!");
    console.log("💡 Run: node scripts/loadQuestionBank.js");
    process.exit(1);
  }
  
  // 2. Show sample questions
  console.log("\n📋 Sample Questions (first 3):");
  console.log("-".repeat(50));
  const samples = await QuestionBank.find({}).limit(3);
  samples.forEach((q, i) => {
    console.log(`\n${i + 1}. Question ID: ${q._id}`);
    console.log(`   Category: "${q.category}"`);
    console.log(`   Topic: "${q.topic}"`);
    console.log(`   Level: "${q.level}"`);
    console.log(`   Question: ${q.question.substring(0, 60)}...`);
    console.log(`   Options: ${q.options.length} options`);
    console.log(`   Correct Answer: ${q.correctAnswer ? 'Yes' : 'No'}`);
  });
  
  // 3. Unique categories
  console.log("\n" + "=".repeat(50));
  console.log("\n📁 All Categories in Database:");
  const categories = await QuestionBank.distinct("category");
  categories.forEach((cat, i) => {
    console.log(`   ${i + 1}. "${cat}"`);
  });
  
  // 4. Count by category
  console.log("\n📊 Question Count by Category:");
  console.log("-".repeat(50));
  for (const category of categories) {
    const count = await QuestionBank.countDocuments({ category });
    console.log(`   ${category}: ${count} questions`);
    
    // Show topics in this category
    const topics = await QuestionBank.distinct("topic", { category });
    console.log(`      Topics: ${topics.join(', ')}`);
    
    // Show levels in this category
    const levels = await QuestionBank.distinct("level", { category });
    console.log(`      Levels: ${levels.join(', ')}`);
    console.log();
  }
  
  // 5. Detailed breakdown
  console.log("=".repeat(50));
  console.log("\n📈 Detailed Breakdown by Topic and Level:");
  console.log("-".repeat(50));
  
  const breakdown = await QuestionBank.aggregate([
    {
      $group: {
        _id: {
          category: '$category',
          topic: '$topic',
          level: '$level'
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: {
        '_id.category': 1,
        '_id.topic': 1,
        '_id.level': 1
      }
    }
  ]);
  
  breakdown.forEach(item => {
    console.log(`   ${item._id.category}/${item._id.topic}/${item._id.level}: ${item.count} questions`);
  });
  
  console.log("\n" + "=".repeat(50));
  console.log("\n💡 Use the EXACT category name shown above in generatePracticeSets.js");
  console.log('   Example: generateAllSets("aptitude") or generateAllSets("Aptitude")\n');
  
  await mongoose.connection.close();
}

checkDatabase();