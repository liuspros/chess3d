// Turns a Lichess / Chess.com rating into this app's scale.
// The app scale is "Chess.com rapid-like". Lichess uses Glicko-2 and runs higher than Chess.com
// for beginners and intermediates (about 250-300 points), and the gap shrinks towards the top.
const LICHESS_OFFSET = [
  [800, 300],
  [1400, 300],
  [1800, 230],
  [2200, 120],
  [2600, 0],
]
const lerpTable = (t, x) => {
  if (x <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1]
      const [x1, y1] = t[i]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return t[t.length - 1][1]
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const rnd5 = (v) => Math.round(v / 5) * 5

export function lichessToApp(r) {
  return rnd5(clamp(r - lerpTable(LICHESS_OFFSET, r), 400, 2800))
}
export function chesscomToApp(r) {
  return rnd5(clamp(r, 400, 2800))
}

// kind: speed -> small adjustment relative to rapid (faster time controls rate higher)
const SPEED_ADJ = { rapid: 0, classical: 0, daily: 0, blitz: -50, bullet: -100 }

// Picks the best-evidenced rating from a normalised list [{ kind, rating, games }].
// With few games the number is pulled toward 1200 because it says little.
export function pickRating(platform, list) {
  const usable = list.filter((x) => x && x.rating > 0 && x.games > 0)
  if (!usable.length) return null
  const pref = (x) => (x.kind === 'bullet' ? 0 : 1)
  usable.sort((a, b) => pref(b) - pref(a) || b.games - a.games)
  const top = usable[0]
  const base = platform === 'lichess' ? lichessToApp(top.rating) : chesscomToApp(top.rating)
  const adj = base + (SPEED_ADJ[top.kind] || 0)
  const trust = clamp(top.games / 30, 0.25, 1)
  return { rating: rnd5(clamp(1200 + (adj - 1200) * trust, 400, 2800)), kind: top.kind, games: top.games, raw: top.rating }
}

export function convertPuzzle(platform, raw) {
  if (!raw) return null
  return platform === 'lichess' ? lichessToApp(raw) : chesscomToApp(raw)
}

// Uncertainty for a freshly imported rating: the system should move it quickly for ~15 games.
export const PROVISIONAL_GAMES = 15
export const initialRd = (platform, games) => clamp((platform === 'lichess' ? 260 : 220) - Math.min(games, 200) / 4, 110, 300)
