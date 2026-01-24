require("dotenv").config();
const mongoose = require("mongoose");
const QuestionBank = require("./models/QuestionBank");
const PracticeSet = require("./models/PracticeSet");

mongoose.connect(process.env.MONGO_URI);

async function fixAptitudeSets() {
  try {
    console.log("🔧 Fixing Aptitude Practice Sets\n");
    
    // Delete existing aptitude sets
    const deleted = await PracticeSet.deleteMany({ category: "aptitude" });
    console.log(`🗑️  Deleted ${deleted.deletedCount} old aptitude sets\n`);
    
    // Get all aptitude topics
    const topics = await QuestionBank.distinct("topic", { category: "aptitude" });
    console.log("📚 Aptitude Topics:", topics);
    
    for (const topic of topics) {
      const levels = await QuestionBank.distinct("level", { category: "aptitude", topic });
      console.log(`\n  Topic: ${topic}`);
      
      for (const level of levels) {
        console.log(`    Level: ${level}`);
        
        const questions = await QuestionBank
          .find({ category: "aptitude", topic, level })
          .sort({ _id: 1 });
        
        console.log(`      Questions found: ${questions.length}`);
        
        if (questions.length < 10) {
          console.log(`      ⚠️  Not enough questions (need 10+)`);
          continue;
        }
        
        let setNumber = 1;
        for (let i = 0; i + 10 <= questions.length; i += 10) {
          const slice = questions.slice(i, i + 10);
          
          const set = await PracticeSet.create({
            category: "aptitude",
            topic,
            level,
            setNumber,
            timeLimit: 10,
            questions: slice.map(q => q._id)
          });
          
          console.log(`      ✅ Created Set ${setNumber} (ID: ${set._id})`);
          setNumber++;
        }
      }
    }
    
    // Verify
    const totalSets = await PracticeSet.countDocuments({ category: "aptitude" });
    console.log(`\n✅ Total Aptitude Sets Created: ${totalSets}`);
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

fixAptitudeSets();


// ============================================
// ALTERNATIVE: Check for typos in category name
// ============================================
/*
require("dotenv").config();
const mongoose = require("mongoose");
const QuestionBank = require("./models/QuestionBank");

mongoose.connect(process.env.MONGO_URI);

async function checkCategoryNames() {
  const questions = await QuestionBank.find({ category: /apt/i });
  
  const uniqueCategories = [...new Set(questions.map(q => q.category))];
  
  console.log("Categories containing 'apt':");
  uniqueCategories.forEach(cat => {
    console.log(`  - "${cat}" (length: ${cat.length})`);
    // Show character codes to detect hidden characters
    console.log(`    Chars: [${cat.split('').map(c => c.charCodeAt(0)).join(', ')}]`);
  });
  
  mongoose.disconnect();
}

checkCategoryNames();
*/