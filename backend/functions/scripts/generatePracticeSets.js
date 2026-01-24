require("dotenv").config();
const mongoose = require("mongoose");
const QuestionBank = require("../../models/QuestionBank");
const PracticeSet = require("../../models/PracticeSet");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

async function generateAllSets(category) {
  console.log(`\n🔍 Finding all topics in category: ${category}\n`);
  
  // Find all unique topic/level combinations
  const topics = await QuestionBank.distinct("topic", { category });
  
  if (topics.length === 0) {
    console.log("❌ No topics found! Make sure you've loaded questions first.");
    process.exit(1);
  }
  
  console.log(`📚 Found ${topics.length} topics: ${topics.join(', ')}\n`);

  let totalSets = 0;

  for (const topic of topics) {
    const levels = await QuestionBank.distinct("level", { category, topic });
    
    for (const level of levels) {
      const sets = await generateSets(category, topic, level);
      totalSets += sets;
    }
  }
  
  console.log(`\n🎉 Success! Generated ${totalSets} practice sets total!`);
  process.exit(0);
}

async function generateSets(category, topic, level) {
  console.log(`📚 Processing: ${category}/${topic}/${level}`);
  
  // Delete existing sets for this combination
  const deleted = await PracticeSet.deleteMany({ category, topic, level });
  if (deleted.deletedCount > 0) {
    console.log(`   🗑️  Deleted ${deleted.deletedCount} old sets`);
  }
  
  // Get all questions in fixed order
  const questions = await QuestionBank
    .find({ category, topic, level })
    .sort({ _id: 1 });

  if (questions.length < 10) {
    console.log(`   ⚠️  Only ${questions.length} questions (need 10+), skipping...\n`);
    return 0;
  }

  let setNumber = 1;
  const setsCreated = [];

  for (let i = 0; i + 10 <= questions.length; i += 10) {
    const slice = questions.slice(i, i + 10);

    await PracticeSet.create({
      category,
      topic,
      level,
      setNumber,
      questions: slice.map(q => q._id)
    });

    setsCreated.push(setNumber);
    setNumber++;
  }

  console.log(`   ✅ Created ${setsCreated.length} sets: Set ${setsCreated.join(', Set ')}`);
  console.log(`   📊 Used ${setsCreated.length * 10} out of ${questions.length} questions\n`);
  
  return setsCreated.length;
}

// 🔧 Change this to match your loaded category
generateAllSets("coding");

/*```

---

## 📝 PDF Format Required

Create your `questions.pdf` with this exact format:
```
=== TOPIC: percentages, LEVEL: easy ===

1. What is 50% of 200?
A. 50
B. 100
C. 150
D. 200
Answer: B

2. Calculate 25% of 80
A. 15
B. 20
C. 25
D. 30
Answer: B

3. If 30% of a number is 90, what is the number?
A. 270
B. 300
C. 330
D. 360
Answer: B

=== TOPIC: profit-loss, LEVEL: medium ===

1. A shopkeeper buys an item for $100 and sells it for $120. What is the profit percentage?
A. 10%
B. 15%
C. 20%
D. 25%
Answer: C

2. An item is sold at a loss of 10%. If the selling price is $450, what was the cost price?
A. $500
B. $495
C. $505
D. $510
Answer: A

=== TOPIC: time-work, LEVEL: hard ===

1. A can complete a work in 10 days and B can complete it in 15 days. How long will they take working together?
A. 5 days
B. 6 days
C. 7 days
D. 8 days
Answer: B */