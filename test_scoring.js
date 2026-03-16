const questions = [
    { _id: 'q1', question: 'What is 1+1?', answer: '2' },
    { _id: 'q2', question: 'What is 2+2?', answer: '4' }
];

const event = {
    marksPerQuestion: 2,
    negativeMarking: 0.5
};

const answers = {
    'q1': '2', // Correct
    'q2': '5'  // Incorrect
};

let score = 0;
let correct = 0;
let wrong = 0;
let skipped = 0;

questions.forEach(q => {
    const userAns = answers[q._id];
    if (!userAns) {
        skipped++;
    } else if (userAns === q.answer) {
        correct++;
        score += event.marksPerQuestion || 1;
    } else {
        wrong++;
        score -= event.negativeMarking || 0;
    }
});

console.log('Results:');
console.log('Score:', score);
console.log('Correct:', correct);
console.log('Wrong:', wrong);
console.log('Skipped:', skipped);

if (score === 1.5) {
    console.log('✅ Scoring logic is correct (2 - 0.5 = 1.5)');
} else {
    console.log('❌ Scoring logic failed. Expected 1.5, got', score);
}
