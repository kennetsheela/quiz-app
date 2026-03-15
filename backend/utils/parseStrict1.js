//parseStrict1.js
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
  let answerBuffer = false; // Flag to indicate we just saw "Answer:" and expect a letter

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for topic marker in PDF - more lenient match
    const topicMatch = line.match(/===\s*TOPIC:\s*(.+?),\s*LEVEL:\s*(.+?)\s*===/i);
    if (topicMatch) {
      currentTopic = topicMatch[1].trim().toLowerCase();
      currentLevel = topicMatch[2].trim().toLowerCase();
      console.log(`\n📚 Switched to topic: ${currentTopic}, level: ${currentLevel}`);
      continue;
    }

    // Pattern 1: Question starts with number (e.g., 1. or 1) or Q1. or Question 1)
    const questionMatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)(?:[\.\):\s]+)(.+)/i);

    if (questionMatch) {
      // Save previous question if valid
      if (currentQuestion && isValidQuestion(currentQuestion)) {
        questions.push(currentQuestion);
        console.log(`✅ Added question ${questions.length}`);
      }

      questionCounter++;
      // If topic or level is missing, use defaults instead of skipping
      currentQuestion = {
        category: category,
        topic: currentTopic || 'general-upload',
        level: currentLevel || 'medium',
        question: questionMatch[2].trim(),
        options: [],
        answer: null,
        answerText: null
      };

      collectingQuestion = true;
      console.log(`📝 Found question ${questionCounter}: ${currentQuestion.question.substring(0, 50)}...`);
      continue;
    }

    if (!currentQuestion) continue;

    // Pattern 2: Options (e.g., A. or A) or a. or a))
    // Improved to handle common multi-option lines if they exist
    const optionMatch = line.match(/^([A-Da-d])[\.\):\s]+(.+)/);

    if (optionMatch) {
      collectingQuestion = false;
      const optionLetter = optionMatch[1].toUpperCase();
      const optionText = optionMatch[2].trim();

      // Basic protection against duplicate options if parser is confused
      const alreadyHasThisLetter = currentQuestion.options_letters?.includes(optionLetter);

      if (!alreadyHasThisLetter && currentQuestion.options.length < 4) {
        currentQuestion.options.push(optionText);
        if (!currentQuestion.options_letters) currentQuestion.options_letters = [];
        currentQuestion.options_letters.push(optionLetter);
        console.log(`   Option ${optionLetter}: ${optionText.substring(0, 40)}...`);
        continue;
      }
    }

    // Pattern 3: Answer with letter (Answer: A or Correct: B or Ans: C or just A)
    const answerLetterMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]*([A-Da-d])\s*$/i);
    const answerMarkerOnlyMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]*$/i);

    if (answerLetterMatch) {
      collectingQuestion = false;
      answerBuffer = false;
      const answerLetter = answerLetterMatch[1].toUpperCase();
      currentQuestion.answerText = answerLetter;

      const answerIndex = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);
      if (answerIndex >= 0 && answerIndex < currentQuestion.options.length) {
        currentQuestion.answer = currentQuestion.options[answerIndex];
        console.log(`   ✓ Answer: ${answerLetter} (${currentQuestion.answer.substring(0, 30)}...)`);
      }
      continue;
    }

    if (answerMarkerOnlyMatch) {
      collectingQuestion = false;
      answerBuffer = true; // Expect letter on next line
      console.log(`   ⏳ Found Answer marker, waiting for letter...`);
      continue;
    }

    // Pattern 3B: Answer as text (Answer: some text explanation)
    const answerTextMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]+(.+)/i);

    if (answerTextMatch && !answerLetterMatch) {
      collectingQuestion = false;
      const answerText = answerTextMatch[1].trim();
      currentQuestion.answerText = answerText;

      // If we have options, try to match the answer text to an option
      if (currentQuestion.options.length > 0) {
        const matchedOption = findBestMatchingOption(answerText, currentQuestion.options);
        if (matchedOption) {
          currentQuestion.answer = matchedOption;
          console.log(`   ✓ Matched answer text to option: ${matchedOption.substring(0, 30)}...`);
        }
      } else {
        // No options yet, store the answer text for later
        console.log(`   💾 Stored answer text: ${answerText.substring(0, 30)}...`);
      }
      continue;
    }

    // Pattern 4: If we have options and next line is just a letter (A, B, C, or D)
    if (currentQuestion.options.length > 0 && !currentQuestion.answer) {
      const justLetter = line.match(/^\s*([A-Da-d])\s*$/); // Allow trailing/leading spaces
      if (justLetter) {
        collectingQuestion = false;
        answerBuffer = false;
        const answerLetter = justLetter[1].toUpperCase();
        currentQuestion.answerText = answerLetter;
        const answerIndex = answerLetter.charCodeAt(0) - 'A'.charCodeAt(0);

        if (answerIndex >= 0 && answerIndex < currentQuestion.options.length) {
          currentQuestion.answer = currentQuestion.options[answerIndex];
          console.log(`   ✓ Linked single letter "${answerLetter}" to option: ${currentQuestion.answer.substring(0, 30)}...`);
          continue;
        }
      }
    }

    // Special case: If we are in answerBuffer mode and find anything else, we might be misaligned
    if (answerBuffer && line.trim().length > 0) {
      console.log(`   🔸 answerBuffer active but line is: "${line.substring(0, 20)}..."`);
    }

    // Reset answerBuffer if current line is not a letter
    if (answerBuffer) answerBuffer = false;

    // Pattern 5: Continue collecting question text if we haven't reached options yet
    if (collectingQuestion && currentQuestion.options.length === 0) {
      // Check if line looks like a bullet point or continuation
      const isBulletPoint = /^[-•·*]\s/.test(line);
      const isDash = /^-\s/.test(line);

      if (isBulletPoint || isDash) {
        // Add bullet point to question with line break
        currentQuestion.question += '\n• ' + line.replace(/^[-•·*]\s*/, '');
        console.log(`   📌 Added bullet: ${line.substring(0, 40)}...`);
      } else if (line.length >= 1 && !optionMatch && !answerLetterMatch && !answerTextMatch) {
        // Regular continuation line - reduced length check to 1 to support short code lines
        currentQuestion.question += '\n' + line;
        console.log(`   ➕ Added continuation: ${line.substring(0, 40)}...`);
      }
      continue;
    }

    // Pattern 6: Handle follow-up questions (lines that end with '?')
    if (currentQuestion.answer && line.endsWith('?') && line.length > 20) {
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
        answer: null,
        answerText: null
      };

      collectingQuestion = true;
      console.log(`📝 Found follow-up question ${questionCounter}: ${line.substring(0, 50)}...`);
      continue;
    }

    // Pattern 7: Explanation (optional)
    if (line.match(/^(?:Explanation|Exp):/i) && currentQuestion.answer) {
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

  // POST-PROCESSING: Generate options for questions without them, or fix missing answers
  const processedQuestions = questions.map((q, index) => {
    // Case 1: No options, but has answerText (generate distractors)
    if (q.options.length === 0 && q.answerText) {
      console.log(`\n🔧 Processing question ${index + 1} without options...`);
      return generateOptionsFromAnswer(q);
    }

    // Case 2: Has options and answerText is a letter (A-D), but answer is still null
    if (q.options.length > 0 && !q.answer && q.answerText && /^[A-D]$/i.test(q.answerText)) {
      const idx = q.answerText.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      if (idx >= 0 && idx < q.options.length) {
        q.answer = q.options[idx];
        console.log(`   ✓ Fixed missing answer for question ${index + 1} using letter index ${q.answerText}`);
      }
    }

    return q;
  });

  console.log(`\n📊 Final result: ${processedQuestions.length} valid questions parsed`);

  if (processedQuestions.length === 0) {
    console.error("❌ No questions parsed!");
    console.error("Sample of raw text:");
    console.error(text.substring(0, 1000));
  }

  // Show breakdown by topic
  const breakdown = {};
  processedQuestions.forEach(q => {
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

  return processedQuestions;
}

// NEW FUNCTION: Generate options from answer text
function generateOptionsFromAnswer(question) {
  console.log(`   🎯 Generating options for: ${question.question.substring(0, 50)}...`);
  console.log(`   📝 Answer text: ${question.answerText}`);

  // The correct answer
  const answer = question.answerText;

  // Generate plausible distractors based on the answer type
  const distractors = generateDistractors(answer, question.question);

  // Combine correct answer with distractors
  const allOptions = [answer, ...distractors].slice(0, 4);

  // Shuffle options
  const shuffledOptions = shuffleArray(allOptions);

  question.options = shuffledOptions;
  question.answer = answer;

  console.log(`   ✅ Generated ${question.options.length} options`);
  question.options.forEach((opt, idx) => {
    const marker = opt === answer ? '✓' : ' ';
    console.log(`   ${marker} ${String.fromCharCode(65 + idx)}. ${opt.substring(0, 40)}...`);
  });

  return question;
}

// NEW FUNCTION: Generate plausible wrong answers
function generateDistractors(answer, questionText) {
  const distractors = [];

  // Check if answer is numeric
  if (/^\d+$/.test(answer)) {
    const num = parseInt(answer);
    distractors.push(String(num + 1));
    distractors.push(String(num - 1));
    distractors.push(String(num * 2));
  }
  // Check if answer is a year
  else if (/^\d{4}$/.test(answer)) {
    const year = parseInt(answer);
    distractors.push(String(year - 1));
    distractors.push(String(year + 1));
    distractors.push(String(year - 10));
  }
  // Check if answer is a percentage
  else if (answer.includes('%')) {
    const num = parseFloat(answer);
    distractors.push(`${num + 5}%`);
    distractors.push(`${num - 5}%`);
    distractors.push(`${num * 2}%`);
  }
  // For text answers, generate related but incorrect options
  else {
    // Split answer into words
    const words = answer.split(/\s+/);

    // Generate variations
    if (words.length > 1) {
      // Swap words
      const swapped = [...words].reverse().join(' ');
      distractors.push(swapped);

      // Remove first word
      distractors.push(words.slice(1).join(' '));

      // Remove last word
      distractors.push(words.slice(0, -1).join(' '));
    } else {
      // Single word - add common variations
      distractors.push(answer + 's');
      distractors.push('Not ' + answer);
      distractors.push(answer + ' related');
    }
  }

  // Ensure we have at least 3 unique distractors
  const uniqueDistractors = [...new Set(distractors)];
  while (uniqueDistractors.length < 3) {
    uniqueDistractors.push(`Option ${uniqueDistractors.length + 1}`);
  }

  return uniqueDistractors.slice(0, 3);
}

// NEW FUNCTION: Find best matching option for answer text
function findBestMatchingOption(answerText, options) {
  const normalizedAnswer = answerText.toLowerCase().trim();

  // Try exact match first
  for (const option of options) {
    if (option.toLowerCase().trim() === normalizedAnswer) {
      return option;
    }
  }

  // Try partial match (answer text contained in option)
  for (const option of options) {
    if (option.toLowerCase().includes(normalizedAnswer)) {
      return option;
    }
  }

  // Try reverse partial match (option contained in answer text)
  for (const option of options) {
    if (normalizedAnswer.includes(option.toLowerCase().trim())) {
      return option;
    }
  }

  // Try matching key words (at least 50% word overlap)
  const answerWords = normalizedAnswer.split(/\s+/).filter(w => w.length > 3);
  let bestMatch = null;
  let bestScore = 0;

  for (const option of options) {
    const optionWords = option.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchCount = answerWords.filter(word =>
      optionWords.some(ow => ow.includes(word) || word.includes(ow))
    ).length;

    const score = matchCount / Math.max(answerWords.length, optionWords.length);

    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = option;
    }
  }

  return bestMatch;
}

// NEW FUNCTION: Shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function isValidQuestion(q) {
  // Modified validation - options can be empty if we have answerText
  const hasValidOptions = q.options.length === 4 && q.answer !== null && q.options.includes(q.answer);
  const hasAnswerText = q.answerText !== null && q.answerText.length > 0;

  const valid =
    q.question &&
    q.question.length > 5 &&
    (hasValidOptions || hasAnswerText) &&
    q.category;
  // Removed strict topic/level check here as we now provide defaults

  if (!valid) {
    const reasons = {
      hasQuestion: !!q.question,
      questionLength: q.question?.length,
      optionsCount: q.options.length,
      hasAnswer: !!q.answer,
      answerInOptions: q.answer ? q.options.includes(q.answer) : false,
      hasAnswerText: !!q.answerText,
      hasCategory: !!q.category,
      hasTopic: !!q.topic,
      hasLevel: !!q.level
    };
    console.log(`⚠️  Invalid question: ${JSON.stringify(reasons)}`);

    // Log helpful warning about missing topic if that's the issue
    if (!q.topic || !q.level) {
      console.log("   TIP: Make sure your file has '=== TOPIC: topic, LEVEL: level ===' markers!");
    }

    // Show the actual question for debugging
    if (q.question) {
      console.log(`   Question preview: ${q.question.substring(0, 50)}...`);
    }
  }

  return valid;
}

module.exports = parseStrict;