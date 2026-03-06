function calculateScore(userAnswers, correctAnswers) {
  let score = 0;
  userAnswers.forEach((ans, i) => {
    if (ans === correctAnswers[i]) score++;
  });
  return score;
}

module.exports = { calculateScore };
