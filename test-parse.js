const parse = require('./backend/utils/parseStrict1');
const testData = `=== TOPIC: Python Programming, LEVEL: easy === 
1. Multi-line Answer Question
A) Possible
B) Correct
C) Wrong
D) Also Wrong
Answer:
B
2. Normal Question
A) 1
B) 2
Answer: B
`;

const questions = parse(testData, { category: 'coding' });
console.log('Total Questions Parsed:', questions.length);
questions.forEach((q, i) => {
    console.log(`Q${i + 1}:`);
    console.log(`  Answer: ${q.answer}`);
    console.log(`  AnswerText: ${q.answerText}`);
});
