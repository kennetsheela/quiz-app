function calculateScore(answers, correctAnswers) {
  let score = 0;
  answers.forEach((ans, i) => {
    if (ans === correctAnswers[i]) score++;
  });
  return score;
}

module.exports = { calculateScore };
