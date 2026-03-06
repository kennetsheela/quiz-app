/**
 * backend/utils/parseStrict.js
 * Specialized parser for Institution Dashboard.
 * 
 * Features:
 * - Robust question/option/answer detection.
 * - Multi-line question support.
 * - Fuzzy answer matching.
 * - Numeric distractor generation.
 * - NO marker requirements (Category/Topic/Level markers are ignored/removed).
 * - Output format: { question, options, answer, explanation }
 */

function parseStrict(text, metadata = {}) {
  console.log("📄 Parsing text (Institution Dashboard Mode), length:", text.length);

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
  let collectingQuestion = false;
  let answerBuffer = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip Topic/Level markers if they exist (User requested removed marker parsing)
    if (line.match(/===\s*TOPIC:\s*(.+?),\s*LEVEL:\s*(.+?)\s*===/i)) {
      continue;
    }

    // Pattern 1: Question Start (1. or Q1. or Question 1)
    const questionMatch = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)[\.\):\s]+(.+)/i);

    if (questionMatch) {
      if (currentQuestion && isValidQuestion(currentQuestion)) {
        questions.push(finalizeInstitutionQuestion(currentQuestion));
      }

      questionCounter++;
      currentQuestion = {
        question: questionMatch[2].trim(),
        options: [],
        answer: null,
        answerText: null,
        explanation: ""
      };

      collectingQuestion = true;
      continue;
    }

    if (!currentQuestion) continue;

    // Pattern 2: Options (A. or A)
    const optionMatch = line.match(/^([A-Da-d])[\.\):\s]+(.+)/);
    if (optionMatch && currentQuestion.options.length < 4) {
      collectingQuestion = false;
      currentQuestion.options.push(optionMatch[2].trim());
      continue;
    }

    // Pattern 3: Answer Marker (Answer: A or Correct: B)
    const answerMarkerMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]*([A-Da-d])\s*$/i);
    if (answerMarkerMatch) {
      collectingQuestion = false;
      currentQuestion.answerText = answerMarkerMatch[1].toUpperCase();
      continue;
    }

    // Pattern 3B: Answer Marker with full text (Answer: Some option text)
    const answerFullTextMatch = line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]+(.+)/i);
    if (answerFullTextMatch && !answerMarkerMatch) {
      collectingQuestion = false;
      currentQuestion.answerText = answerFullTextMatch[1].trim();
      continue;
    }

    // Pattern 4: Answer Marker Only (Await letter on next line)
    if (line.match(/^(?:Answer|Correct|Ans|Solution)[\s:]*$/i)) {
      collectingQuestion = false;
      answerBuffer = true;
      continue;
    }

    // Pattern 5: Single letter answer or waiting for buffered letter
    if (answerBuffer || (currentQuestion.options.length === 4 && !currentQuestion.answerText)) {
      const letterMatch = line.match(/^\s*([A-Da-d])\s*$/i);
      if (letterMatch) {
        currentQuestion.answerText = letterMatch[1].toUpperCase();
        answerBuffer = false;
        continue;
      }
    }

    // Pattern 6: Continuation of question text
    if (collectingQuestion) {
      currentQuestion.question += (currentQuestion.question.endsWith('\n') ? "" : "\n") + line;
      continue;
    }

    // Pattern 7: Explanation
    if (line.match(/^(?:Explanation|Exp):/i)) {
      currentQuestion.explanation = line.replace(/^(?:Explanation|Exp):\s*/i, '').trim();
      continue;
    }
  }

  // Final question
  if (currentQuestion && isValidQuestion(currentQuestion)) {
    questions.push(finalizeInstitutionQuestion(currentQuestion));
  }

  // Post-processing: Map letters to options or generate distractors
  const processed = questions.map(q => {
    // Generate options if missing (but we have an answer)
    if (q.options.length === 0 && q.answerText) {
      return generateInstitutionOptions(q);
    }

    // Map answer letter or text to options
    if (q.answerText && !q.answer) {
      // 1. Try letter index match
      if (/^[A-D]$/i.test(q.answerText)) {
        const idx = q.answerText.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < q.options.length) {
          q.answer = q.options[idx];
        }
      }

      // 2. Try fuzzy text match if no letter match
      if (!q.answer) {
        q.answer = findBestMatch(q.answerText, q.options);
      }
    }

    // Final fallback: if still no answer but we have options, take first (should rarely happen with proper files)
    if (!q.answer && q.options.length > 0) {
      q.answer = q.options[0];
    }

    // Clean up temporary parsing fields
    const { answerText, ...finalQ } = q;
    return finalQ;
  });

  console.log(`✅ Parsed ${processed.length} questions (Institution Mode)`);
  return processed;
}

function isValidQuestion(q) {
  return q.question && q.question.trim().length > 5;
}

function finalizeInstitutionQuestion(q) {
  return {
    question: q.question.trim(),
    options: q.options,
    answer: q.answer,
    answerText: q.answerText,
    explanation: q.explanation || ""
  };
}

function findBestMatch(answerText, options) {
  const norm = answerText.toLowerCase().trim();
  return options.find(o => o.toLowerCase().trim() === norm) ||
    options.find(o => o.toLowerCase().includes(norm)) ||
    options.find(o => norm.includes(o.toLowerCase())) ||
    null;
}

function generateInstitutionOptions(q) {
  const answer = q.answerText;
  const distractors = [];

  // Numeric Distractors
  if (/^\d+(\.\d+)?$/.test(answer)) {
    const n = parseFloat(answer);
    distractors.push(String(n + 1), String(n - 1), String(n * 2));
  } else {
    // Text Distractors
    distractors.push(answer + " (alt 1)", answer + " (alt 2)", answer + " (alt 3)");
  }

  const all = [answer, ...distractors].slice(0, 4);
  q.options = all.sort(() => Math.random() - 0.5);
  q.answer = answer;
  return q;
}

module.exports = parseStrict;