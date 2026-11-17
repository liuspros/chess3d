import { Chess } from 'chess.js'
import { Engine } from './engine.js'

// win probability (0..100) from a centipawn score
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
const accuracyOf = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))

export const CLASSES = {
  best: { label: 'Best', color: '#7ccf6a', icon: '!!' },
  good: { label: 'Good', color: '#a7c957', icon: '' },
  inaccuracy: { label: 'Inaccuracy', color: '#e9c46a', icon: '?!' },
  mistake: { label: 'Mistake', color: '#f4a259', icon: '?' },
  blunder: { label: 'Blunder', color: '#e5554b', icon: '??' },
}

export function classify(loss, isBest) {
  if (isBest || loss < 2) return 'best'
  if (loss < 5) return 'good'
  if (loss < 10) return 'inaccuracy'
  if (loss < 20) return 'mistake'
  return 'blunder'
}

// Runs Stockfish over every position. Returns white-POV win% per ply, best moves and move classes.
export async function analyzeGame(ucis, startFen, onProgress, signal) {
  const eng = new Engine()
  try {
    const chess = startFen ? new Chess(startFen) : new Chess()
    const fens = [chess.fen()]
    const sans = []
    for (const u of ucis) {
      const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      sans.push(m.san)
      fens.push(chess.fen())
    }
    const pct = [] // white POV
    const best = []
    for (let i = 0; i < fens.length; i++) {
      if (signal?.aborted) return null
      const c = new Chess(fens[i])
      const turn = c.turn()
      if (c.isCheckmate()) {
        pct.push(turn === 'w' ? 0 : 100)
        best.push(null)
      } else if (c.isDraw() || c.isStalemate()) {
        pct.push(50)
        best.push(null)
      } else {
        const r = await eng.evaluate(fens[i], i < 2 ? 100 : 160)
        const cp = r.type === 'mate' ? (r.v > 0 ? 1000 : -1000) : r.v
        pct.push(winPct(turn === 'w' ? cp : -cp))
        best.push(r.best)
      }
      onProgress?.((i + 1) / fens.length)
    }
    const cls = []
    const acc = { w: [], b: [] }
    for (let i = 0; i < ucis.length; i++) {
      const mover = i % 2 === 0 ? 'w' : 'b'
      const before = mover === 'w' ? pct[i] : 100 - pct[i]
      const after = mover === 'w' ? pct[i + 1] : 100 - pct[i + 1]
      const loss = Math.max(0, before - after)
      const isBest = best[i] === ucis[i]
      cls.push({ cls: classify(loss, isBest), loss, best: best[i], san: sans[i] })
      acc[mover].push(accuracyOf(loss))
    }
    const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null)
    return { fens, pct, cls, accuracy: { w: avg(acc.w), b: avg(acc.b) } }
  } finally {
    eng.destroy()
  }
}

// convert a UCI best move to SAN for a given FEN
export function uciToSan(fen, uci) {
  if (!uci) return ''
  try {
    const c = new Chess(fen)
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return uci
  }
}
