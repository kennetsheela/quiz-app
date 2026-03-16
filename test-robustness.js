const parse = require('./backend/utils/parseStrict1');

const testFormats = `
=== TOPIC: Format Test, LEVEL: easy ===
1. Standard with dot
A. Option 1
B. Option 2
Answer: A

2) Standard with parenthesis
A. Option 1
B. Option 2
Answer: B

3: Standard with colon
A. Option 1
B. Option 2
Answer: A

4 Standard with space
A. Option 1
B. Option 2
Answer: B

Q5. Question marker
A. Option 1
B. Option 2
Answer: A

Question 6) Full word marker
A. Option 1
B. Option 2
Answer: B

7. Question with multi-line
text that continues
A. Option 1
B. Option 2
Answer: A

8. Question with bullet points
- Bullet 1
- Bullet 2
A. Option 1
B. Option 2
Answer: B

9. Question without any topic marker
A. Yes it works
B. No it fails
Answer: A
`;

const questions = parse(testFormats, { category: 'aptitude' });
console.log('Total Questions Parsed:', questions.length);
questions.forEach((q, i) => {
    console.log(`Q${i + 1} (${q.topic}): ${q.question.substring(0, 30)}...`);
    console.log(`   Options: ${q.options.length}, Answer: ${q.answer}`);
});
