// Generates verified chess puzzles by self-play + Stockfish analysis.
// usage: node scripts/gen-puzzles.mjs <seed> <outfile> <minutes>
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const seed = parseInt(process.argv[2] || '1', 10)
const out = process.argv[3] || `scripts/out-${seed}.json`
const minutes = parseFloat(process.argv[4] || '10')
const deadline = Date.now() + minutes * 60 * 1000

// small deterministic PRNG so runs are reproducible per seed
let s = seed * 2654435761 >>> 0
const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296)

const TARGET = { mate1: 8, mate2: 14, mate3: 8, tactic: 14 }
const found = { mate1: [], mate2: [], mate3: [], tactic: [] }
const seen = new Set()

class SF {
  constructor() {
    this.p = spawn('node', ['node_modules/stockfish/bin/stockfish-19-lite-single.js'])
    this.buf = ''
    this.waiter = null
    this.p.stdout.on('data', (d) => {
      this.buf += d
      let i
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim()
        this.buf = this.buf.slice(i + 1)
        if (this.waiter) this.waiter(line)
      }
    })
    this.send('uci')
    this.send('setoption name Hash value 32')
  }
  send(c) {
    this.p.stdin.write(c + '\n')
  }
  async analyse(fen, depth = 10, multipv = 2) {
    this.send(`setoption name MultiPV value ${multipv}`)
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
    const best = {}
    await new Promise((resolve) => {
      this.waiter = (line) => {
        if (line.startsWith('info') && line.includes(' pv ') && line.includes('score')) {
          const mpv = parseInt((line.match(/multipv (\d+)/) || [0, 1])[1], 10)
          const sc = line.match(/score (cp|mate) (-?\d+)/)
          const pv = line.split(' pv ')[1].trim().split(' ')
          const d = parseInt((line.match(/depth (\d+)/) || [0, 0])[1], 10)
          if (sc) best[mpv] = { type: sc[1], value: parseInt(sc[2], 10), pv, depth: d }
        } else if (line.startsWith('bestmove')) {
          this.waiter = null
          resolve()
        }
      }
    })
    return Object.keys(best)
      .sort((a, b) => a - b)
      .map((k) => best[k])
  }
  quit() {
    this.p.kill()
  }
}

const isMateWin = (r) => r && r.type === 'mate' && r.value > 0
const cpOf = (r) => (r.type === 'mate' ? (r.value > 0 ? 10000 - r.value : -10000 - r.value) : r.value)

function key(fen) {
  return fen.split(' ').slice(0, 2).join(' ')
}

function pieceCount(fen) {
  return fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length
}

function rating(type, extra) {
  const base = { mate1: 700, mate2: 1100, mate3: 1500, tactic: 1250 }[type]
  return base + Math.floor(rnd() * 160) + (extra || 0)
}

function full() {
  return Object.keys(TARGET).every((k) => found[k].length >= TARGET[k])
}

function save() {
  const all = Object.values(found).flat()
  writeFileSync(out, JSON.stringify(all, null, 0))
}

// verify every step of a forced mate line is unique-ish
async function verifyMate(sf, fen, m, line) {
  const chess = new Chess(fen)
  let remaining = m
  for (let i = 0; i < line.length; i += 2) {
    if (remaining > 1) {
      const res = await sf.analyse(chess.fen(), 11, 2)
      if (!isMateWin(res[0]) || res[0].value !== remaining) return false
      if (isMateWin(res[1]) && res[1].value <= remaining + 1) return false // another mate of similar length
      if (res[0].pv[0] !== line[i]) return false
    }
    try {
      chess.move({ from: line[i].slice(0, 2), to: line[i].slice(2, 4), promotion: line[i][4] })
      if (i + 1 < line.length)
        chess.move({ from: line[i + 1].slice(0, 2), to: line[i + 1].slice(2, 4), promotion: line[i + 1][4] })
    } catch {
      return false
    }
    remaining--
  }
  return chess.isCheckmate()
}

async function main() {
  const sf = new SF()
  let games = 0
  let analysed = 0
  while (Date.now() < deadline && !full()) {
    games++
    const chess = new Chess()
    let prevEvalForMover = null // eval (cp) from the viewpoint of the side that just moved
    for (let ply = 0; ply < 110 && !chess.isGameOver(); ply++) {
      const fen = chess.fen()
      let res
      if (ply < 6) {
        // random opening moves
        const mv = chess.moves()
        chess.move(mv[Math.floor(rnd() * mv.length)])
        continue
      }
      res = await sf.analyse(fen, 10, 3)
      analysed++
      if (!res.length) break
      const top = res[0]
      const side = chess.turn()
      const pcs = pieceCount(fen)
      const k = key(fen)

      if (pcs >= 7 && !seen.has(k)) {
        // mate puzzles
        if (isMateWin(top) && top.value >= 1 && top.value <= 3) {
          const m = top.value
          const type = `mate${m}`
          const second = res[1]
          const unique = m === 1 || !second || !(isMateWin(second) && second.value <= m + 1)
          if (found[type].length < TARGET[type] && unique && top.pv.length >= 2 * m - 1) {
            const line = top.pv.slice(0, 2 * m - 1)
            if (m === 1 || (await verifyMate(sf, fen, m, line))) {
              seen.add(k)
              found[type].push({
                id: `${type}-${seed}-${found[type].length + 1}`,
                fen,
                side,
                type,
                theme: m === 1 ? 'Mate in 1' : `Mate in ${m}`,
                solution: line,
                rating: rating(type),
              })
              save()
              console.log(`[${seed}] +${type} (${found[type].length}/${TARGET[type]}) after ${analysed} positions`)
            }
          }
        }
        // tactics: previous position was about equal/worse for us, now a unique winning move exists
        else if (
          found.tactic.length < TARGET.tactic &&
          top.type === 'cp' &&
          top.value >= 350 &&
          top.value <= 1200 &&
          res[1] &&
          cpOf(res[1]) <= top.value - 250 &&
          prevEvalForMover !== null &&
          -prevEvalForMover <= 120 // wait: prev eval was from the opponent viewpoint (they just moved)
        ) {
          seen.add(k)
          found.tactic.push({
            id: `tactic-${seed}-${found.tactic.length + 1}`,
            fen,
            side,
            type: 'tactic',
            theme: 'Win material',
            solution: [top.pv[0]],
            rating: rating('tactic', Math.round((top.value - 350) / 8)),
          })
          save()
          console.log(`[${seed}] +tactic (${found.tactic.length}/${TARGET.tactic}) after ${analysed} positions`)
        }
      }

      // choose next move: mostly best, sometimes a weaker one to create mistakes
      let choice = top.pv[0]
      const r = rnd()
      if (res.length > 1 && r < 0.22) choice = res[1 + Math.floor(rnd() * (res.length - 1))].pv[0]
      prevEvalForMover = cpOf(top) // viewpoint of the side to move now, which becomes "opponent" next ply
      try {
        chess.move({ from: choice.slice(0, 2), to: choice.slice(2, 4), promotion: choice[4] })
      } catch {
        break
      }
    }
  }
  sf.quit()
  save()
  console.log(`[${seed}] done: ${games} games, ${analysed} positions`, Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])))
  process.exit(0)
}

main()
