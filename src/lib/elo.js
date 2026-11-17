// Standard Elo with a higher K for new players.
export function kFactor(games) {
  if (games < 20) return 40
  if (games < 60) return 20
  return 10
}

// score: 1 win, 0.5 draw, 0 loss
// provisional: imported ratings are uncertain, so they move faster for the first ~15 games
export function eloDelta(rating, oppRating, score, games, provisional = 0) {
  const expected = 1 / (1 + Math.pow(10, (oppRating - rating) / 400))
  const k = provisional > 0 ? Math.max(kFactor(games), 50) : kFactor(games)
  return Math.round(k * (score - expected))
}
