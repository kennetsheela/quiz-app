// backend/utils/parseStrict.js
// Enhanced parser that handles multiple question formats

function parseStrict(text) {
  console.log("📄 Parsing text, length:", text.length);
  console.log("📝 First 500 characters:", text.substring(0, 500));
  
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
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
        question: questionMatch[2].trim(),
        options: [],
        correctAnswer: null
      };
      
      console.log(`📝 Found question ${questionCounter}: ${currentQuestion.question.substring(0, 50)}...`);
      continue;
    }

    if (!currentQuestion) continue;

    // Pattern 2: Options (A. or A) or a. or a))
    const optionMatch = line.match(/^([A-Da-d])[\.\):\s]+(.+)/);
    
    if (optionMatch && currentQuestion.options.length < 4) {
      const optionText = optionMatch[2].trim();
      currentQuestion.options.push(optionText);
      console.log(`   Option ${currentQuestion.options.length}: ${optionText.substring(0, 40)}...`);
      continue;
    }

    // Pattern 3: Answer (Answer: A or Correct: B or Ans: C or just A)
    const answerMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]*([A-Da-d])/i);
    
    if (answerMatch) {
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
        const answerLetter = justLetter[1].toUpperCase();
        const answerIndex = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);
        currentQuestion.correctAnswer = currentQuestion.options[answerIndex];
        console.log(`   ✓ Answer: ${answerLetter} (${currentQuestion.correctAnswer.substring(0, 30)}...)`);
        continue;
      }
    }

    // Pattern 5: If line is not recognized and we don't have a question yet, it might be the question
    if (!currentQuestion.question || currentQuestion.question.length < 10) {
      currentQuestion.question = (currentQuestion.question + ' ' + line).trim();
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

  return questions;
}

function isValidQuestion(q) {
  const valid = 
    q.question && 
    q.question.length > 5 && 
    q.options.length === 4 && 
    q.correctAnswer !== null &&
    q.options.includes(q.correctAnswer);
  
  if (!valid) {
    console.log(`⚠️  Invalid question: ${JSON.stringify({
      hasQuestion: !!q.question,
      questionLength: q.question?.length,
      optionsCount: q.options.length,
      hasCorrectAnswer: !!q.correctAnswer,
      correctAnswerInOptions: q.options.includes(q.correctAnswer)
    })}`);
  }
  
  return valid;
}

module.exports = parseStrict;

// ========================================
// EXAMPLE FORMATS THIS PARSER HANDLES:
// ========================================

/*
FORMAT 1 - Standard numbered:
1. What is 2+2?
A. 2
B. 3
C. 4
D. 5
Answer: C

FORMAT 2 - With Question prefix:
Question 1: What is the capital of France?
A) London
B) Paris
C) Berlin
D) Rome
Correct: B

FORMAT 3 - Compact:
Q1. Who invented the light bulb?
a) Tesla
b) Edison
c) Einstein
d) Newton
Ans: B

FORMAT 4 - Just letter answer:
1) What is Python?
A. A snake
B. A programming language
C. A movie
D. A game
B

FORMAT 5 - Mixed case:
1. What does HTML stand for?
a. Hyper Text Markup Language
b. High Tech Modern Language
c. Home Tool Markup Language
d. None of the above
answer: a
*/