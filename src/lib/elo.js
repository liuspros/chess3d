// Standard Elo with a higher K for new players.
export function kFactor(games) {
  if (games < 20) return 40
  if (games < 60) return 20
  return 10
}

// score: 1 win, 0.5 draw, 0 loss
export function eloDelta(rating, oppRating, score, games) {
  const expected = 1 / (1 + Math.pow(10, (oppRating - rating) / 400))
  return Math.round(kFactor(games) * (score - expected))
}
