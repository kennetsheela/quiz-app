const parseStrict1 = require("./backend/utils/parseStrict1");

const sampleText = `=== TOPIC: Python Programming, LEVEL: easy === 
1. What will be the output of the following Python code?   
print(10 + 5 * 2)   
A) 30   
B) 20   
C) 15   
D) 25   
Answer: B 
2. Which of these is a valid variable name in Python?   
A) 1number   
B) my-number   
C) total_count   
D) class   
Answer: C 
3. What is the output of this code?`;

const questions = parseStrict1(sampleText, { category: "coding" });

console.log("Parsed Questions Count:", questions.length);
questions.forEach((q, i) => {
    console.log(`\nQ${i + 1}: ${q.question}`);
    console.log(`Topic: ${q.topic}, Level: ${q.level}, Category: ${q.category}`);
    console.log(`Options: ${q.options.join(", ")}`);
    console.log(`Correct: ${q.answer}`);
});
