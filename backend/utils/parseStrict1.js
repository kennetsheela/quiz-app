function parseStrict(text, metadata = {}) {
  console.log("📄 Parsing text, length:", text.length);
  console.log("📝 First 500 characters:", text.substring(0, 500));
  
  const { category = null } = metadata;
  
  const questions = [];
  
  // Normalize line endings and split into lines
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  console.log(`📋 Total non-empty lines: ${lines.length}`);

  let currentQuestion = null;
  let questionCounter = 0;
  let currentTopic = null;
  let currentLevel = null;
  let collectingQuestion = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for topic marker in PDF
    const topicMatch = line.match(/^===\s*TOPIC:\s*(.+?),\s*LEVEL:\s*(.+?)\s*===/i);
    if (topicMatch) {
      currentTopic = topicMatch[1].trim().toLowerCase();
      currentLevel = topicMatch[2].trim().toLowerCase();
      console.log(`\n📚 Switched to topic: ${currentTopic}, level: ${currentLevel}`);
      continue;
    }
    
    // Pattern 1: Question starts with number (1. or 1) or Q1. or Question 1)
    const questionMatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)[\.\):\s]+(.+)/i);
    
    if (questionMatch) {
      // Save previous question if valid
      if (currentQuestion && isValidQuestion(currentQuestion)) {
        questions.push(currentQuestion);
        console.log(`✅ Added question ${questions.length}`);
      }
      
      questionCounter++;
      currentQuestion = {
        category: category,
        topic: currentTopic,
        level: currentLevel,
        question: questionMatch[2].trim(),
        options: [],
        correctAnswer: null
      };
      
      collectingQuestion = true;
      
      console.log(`📝 Found question ${questionCounter}: ${currentQuestion.question.substring(0, 50)}...`);
      continue;
    }

    if (!currentQuestion) continue;

    // Pattern 2: Options (A. or A) or a. or a))
    const optionMatch = line.match(/^([A-Da-d])[\.\):\s]+(.+)/);
    
    if (optionMatch && currentQuestion.options.length < 4) {
      collectingQuestion = false;
      const optionText = optionMatch[2].trim();
      currentQuestion.options.push(optionText);
      console.log(`   Option ${currentQuestion.options.length}: ${optionText.substring(0, 40)}...`);
      continue;
    }

    // Pattern 3: Answer (Answer: A or Correct: B or Ans: C or just A)
    const answerMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]*([A-Da-d])/i);
    
    if (answerMatch) {
      collectingQuestion = false;
      const answerLetter = answerMatch[1].toUpperCase();
      const answerIndex = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);
      
      if (answerIndex >= 0 && answerIndex < currentQuestion.options.length) {
        currentQuestion.correctAnswer = currentQuestion.options[answerIndex];
        console.log(`   ✓ Answer: ${answerLetter} (${currentQuestion.correctAnswer.substring(0, 30)}...)`);
      }
      continue;
    }

    // Pattern 4: If we have 4 options and next line is just a letter (A, B, C, or D)
    if (currentQuestion.options.length === 4 && !currentQuestion.correctAnswer) {
      const justLetter = line.match(/^([A-Da-d])$/);
      if (justLetter) {
        collectingQuestion = false;
        const answerLetter = justLetter[1].toUpperCase();
        const answerIndex = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);
        currentQuestion.correctAnswer = currentQuestion.options[answerIndex];
        console.log(`   ✓ Answer: ${answerLetter} (${currentQuestion.correctAnswer.substring(0, 30)}...)`);
        continue;
      }
    }

    // Pattern 5: Continue collecting question text if we haven't reached options yet
    if (collectingQuestion && currentQuestion.options.length === 0) {
      // Check if line looks like a bullet point or continuation
      const isBulletPoint = /^[-•·*]\s/.test(line);
      const isDash = /^-\s/.test(line);
      
      if (isBulletPoint || isDash) {
        // Add bullet point to question with line break
        currentQuestion.question += '\n• ' + line.replace(/^[-•·*]\s*/, '');
        console.log(`   📌 Added bullet: ${line.substring(0, 40)}...`);
      } else if (line.length > 10 && !optionMatch && !answerMatch) {
        // Regular continuation line
        currentQuestion.question += '\n' + line;
        console.log(`   ➕ Added continuation: ${line.substring(0, 40)}...`);
      }
      continue;
    }

    // NEW Pattern 6: Handle follow-up questions (lines that end with '?')
    // This handles questions without numbers, after we've collected a complete question
    if (currentQuestion.correctAnswer && line.endsWith('?') && line.length > 20) {
      // Save the current complete question
      if (isValidQuestion(currentQuestion)) {
        questions.push(currentQuestion);
        console.log(`✅ Added question ${questions.length}`);
      }
      
      // Start a new question with the follow-up text
      questionCounter++;
      currentQuestion = {
        category: category,
        topic: currentTopic,
        level: currentLevel,
        question: line,
        options: [],
        correctAnswer: null
      };
      
      collectingQuestion = true;
      console.log(`📝 Found follow-up question ${questionCounter}: ${line.substring(0, 50)}...`);
      continue;
    }

    // Pattern 7: Explanation (optional)
    if (line.match(/^(?:Explanation|Exp):/i) && currentQuestion.correctAnswer) {
      const explanation = line.replace(/^(?:Explanation|Exp):\s*/i, '').trim();
      currentQuestion.explanation = explanation;
      console.log(`   💡 Explanation: ${explanation.substring(0, 40)}...`);
      continue;
    }
  }

  // Don't forget the last question
  if (currentQuestion && isValidQuestion(currentQuestion)) {
    questions.push(currentQuestion);
    console.log(`✅ Added question ${questions.length}`);
  }

  console.log(`\n📊 Final result: ${questions.length} valid questions parsed`);
  
  if (questions.length === 0) {
    console.error("❌ No questions parsed!");
    console.error("Sample of raw text:");
    console.error(text.substring(0, 1000));
  }

  // Show breakdown by topic
  const breakdown = {};
  questions.forEach(q => {
    if (q.topic && q.level) {
      const key = `${q.topic}-${q.level}`;
      breakdown[key] = (breakdown[key] || 0) + 1;
    }
  });
  if (Object.keys(breakdown).length > 0) {
    console.log("\n📈 Questions by topic:");
    Object.entries(breakdown).forEach(([key, count]) => {
      console.log(`   ${key}: ${count} questions`);
    });
  }

  return questions;
}

function isValidQuestion(q) {
  const valid = 
    q.question && 
    q.question.length > 5 && 
    q.options.length === 4 && 
    q.correctAnswer !== null &&
    q.options.includes(q.correctAnswer) &&
    q.category &&
    q.topic &&
    q.level;
  
  if (!valid) {
    console.log(`⚠️  Invalid question: ${JSON.stringify({
      hasQuestion: !!q.question,
      questionLength: q.question?.length,
      optionsCount: q.options.length,
      hasCorrectAnswer: !!q.correctAnswer,
      correctAnswerInOptions: q.correctAnswer ? q.options.includes(q.correctAnswer) : false,
      hasCategory: !!q.category,
      hasTopic: !!q.topic,
      hasLevel: !!q.level
    })}`);
    
    // Show the actual question for debugging
    if (q.question) {
      console.log(`   Question preview: ${q.question.substring(0, 100)}...`);
    }
  }
  
  return valid;
}

module.exports = parseStrict;