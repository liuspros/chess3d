// Stockfish 19 (lite, single-thread WASM) running in a Web Worker.
// Single-thread build = no special COOP/COEP headers needed, works on any host.

export const LEVELS = [
  { id: 'beginner', name: 'Beginner', elo: '~800', skill: 0, depth: 2, time: 120, blunder: 0.3 },
  { id: 'casual', name: 'Casual', elo: '~1200', skill: 4, depth: 5, time: 250, blunder: 0.1 },
  { id: 'club', name: 'Club', elo: '~1600', skill: 9, depth: 9, time: 500, blunder: 0.02 },
  { id: 'advanced', name: 'Advanced', elo: '~2000', skill: 15, depth: 13, time: 900, blunder: 0 },
  { id: 'master', name: 'Master', elo: '2400+', skill: 20, depth: 20, time: 1600, blunder: 0 },
]

export class Engine {
  constructor() {
    this.worker = null
    this.readyPromise = null
    this.pending = null
    this.active = 0 // searches started and not yet answered
    this.discard = 0 // answers to throw away (stopped searches)
  }

  init() {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`)
      } catch (e) {
        reject(e)
        return
      }
      const timer = setTimeout(() => reject(new Error('Engine start timed out')), 20000)
      this.worker.onerror = (e) => {
        clearTimeout(timer)
        reject(e)
      }
      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : String(e.data)
        if (line === 'uciok') {
          this.worker.postMessage('setoption name Hash value 16')
          this.worker.postMessage('isready')
        } else if (line === 'readyok') {
          clearTimeout(timer)
          resolve()
        } else if (line.startsWith('info') && this.evalCtx) {
          const m = / score (cp|mate) (-?\d+)/.exec(line)
          if (m && !line.includes('lowerbound') && !line.includes('upperbound')) this.evalCtx.score = { type: m[1], v: parseInt(m[2], 10) }
        } else if (line.startsWith('bestmove')) {
          if (this.evalCtx) {
            const c = this.evalCtx
            this.evalCtx = null
            const mv = line.split(' ')[1]
            c.resolve({ ...(c.score || { type: 'cp', v: 0 }), best: !mv || mv === '(none)' ? null : mv })
          } else this._onBest(line)
        }
      }
      this.worker.postMessage('uci')
    })
    return this.readyPromise
  }

  _onBest(line) {
    this.active = Math.max(0, this.active - 1)
    if (this.discard > 0) {
      this.discard--
      return
    }
    const mv = line.split(' ')[1]
    const p = this.pending
    this.pending = null
    if (p) p.resolve(!mv || mv === '(none)' ? null : mv)
  }

  async bestMove(fen, level) {
    await this.init()
    // a newer request replaces an older one
    this.stop()
    return new Promise((resolve) => {
      this.pending = { resolve }
      this.active++
      this.worker.postMessage(`setoption name Skill Level value ${level.skill}`)
      this.worker.postMessage(`position fen ${fen}`)
      this.worker.postMessage(`go depth ${level.depth} movetime ${level.time}`)
    })
  }

  // analysis: score from the side-to-move's point of view + best move
  async evaluate(fen, ms = 150) {
    await this.init()
    return new Promise((resolve) => {
      this.evalCtx = { resolve, score: null }
      this.worker.postMessage('setoption name Skill Level value 20')
      this.worker.postMessage(`position fen ${fen}`)
      this.worker.postMessage(`go movetime ${ms}`)
    })
  }

  stop() {
    if (!this.worker) return
    if (this.active - this.discard > 0) {
      this.worker.postMessage('stop')
      this.discard++
    }
    if (this.pending) {
      const p = this.pending
      this.pending = null
      p.resolve(null)
    }
  }

  destroy() {
    this.worker?.terminate()
    this.worker = null
    this.readyPromise = null
  }
}
