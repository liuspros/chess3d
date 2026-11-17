import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Engine, LEVELS } from './engine.js'
import { play, haptic } from '../lib/sound.js'

export const TIME_CONTROLS = [
  { id: 'inf', label: 'No clock', base: null, inc: 0 },
  { id: '1+0', label: '1 min', base: 60000, inc: 0 },
  { id: '3+2', label: '3 | 2', base: 180000, inc: 2000 },
  { id: '5+0', label: '5 min', base: 300000, inc: 0 },
  { id: '10+0', label: '10 min', base: 600000, inc: 0 },
  { id: '15+10', label: '15 | 10', base: 900000, inc: 10000 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function buildPieces(chess) {
  const out = []
  let n = 0
  chess.board().forEach((row) =>
    row.forEach((c) => {
      if (c) out.push({ id: `${c.color}${c.type}${n++}`, type: c.type, color: c.color, square: c.square, captured: false, tray: 0 })
    }),
  )
  return out
}

// Keeps piece identities stable so the 3D scene can animate real moves.
export function applyMove(pieces, mv) {
  const next = pieces.map((p) => ({ ...p }))
  const capSq = mv.flags.includes('e') ? mv.to[0] + mv.from[1] : mv.to
  if (mv.captured) {
    const cap = next.find((p) => !p.captured && p.square === capSq)
    if (cap) {
      cap.tray = next.filter((p) => p.captured && p.color === cap.color).length
      cap.captured = true
      cap.square = null
    }
  }
  const mover = next.find((p) => !p.captured && p.square === mv.from)
  if (mover) {
    mover.square = mv.to
    if (mv.promotion) mover.type = mv.promotion
  }
  if (mv.flags.includes('k') || mv.flags.includes('q')) {
    const rank = mv.from[1]
    const [rf, rt] = mv.flags.includes('k') ? ['h', 'f'] : ['a', 'd']
    const rook = next.find((p) => !p.captured && p.square === rf + rank)
    if (rook) rook.square = rt + rank
  }
  return next
}

// Describes a move for the 3D scene (what to pick up, where to put it, what to take).
function buildEvent(id, before, m, chess, afterPieces) {
  const mover = before.find((p) => !p.captured && p.square === m.from)
  const steps = [{ pieceId: mover.id, type: mover.type, color: mover.color, from: m.from, to: m.to }]
  if (m.flags.includes('k') || m.flags.includes('q')) {
    const rank = m.from[1]
    const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd']
    const rook = before.find((p) => !p.captured && p.square === rf + rank)
    if (rook) steps.push({ pieceId: rook.id, type: 'r', color: rook.color, from: rf + rank, to: rt + rank })
  }
  let captureId = null
  let captureSq = null
  if (m.captured) {
    captureSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to
    const cap = before.find((p) => !p.captured && p.square === captureSq)
    captureId = cap ? cap.id : null
  }
  const mate = chess.isCheckmate()
  let mateKingSq = null
  if (mate) {
    const k = afterPieces.find((p) => p.type === 'k' && p.color === chess.turn() && !p.captured)
    mateKingSq = k ? k.square : null
  }
  let sound = 'move'
  if (mate) sound = 'mate'
  else if (chess.inCheck()) sound = 'check'
  else if (m.promotion) sound = 'promote'
  else if (m.flags.includes('k') || m.flags.includes('q')) sound = 'castle'
  else if (m.captured) sound = 'capture'
  return { id, side: m.color, san: m.san, steps, captureId, captureSq, promotion: m.promotion || null, check: chess.inCheck(), mate, mateKingSq, sound }
}

export function useChessGame() {
  const chessRef = useRef(new Chess())
  const engineRef = useRef(null)
  const piecesRef = useRef(null)
  const snaps = useRef([])
  const clocksRef = useRef({ w: null, b: null })
  const settingsRef = useRef(null)
  const moveHandlerRef = useRef({})
  const eventId = useRef(0)
  const reviewRef = useRef({ snaps: [], moves: [], fens: [] })

  const [pieces, setPiecesState] = useState(() => buildPieces(chessRef.current))
  const [moves, setMoves] = useState([])
  const [selected, setSelected] = useState(null)
  const [lastMove, setLastMove] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | playing | over | review
  const [result, setResult] = useState(null)
  const [settings, setSettings] = useState(null)
  const [pendingPromo, setPendingPromo] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [clocks, setClocks] = useState({ w: null, b: null })
  const [engineError, setEngineError] = useState(false)
  const [turn, setTurn] = useState('w')
  const [inCheck, setInCheck] = useState(false)
  const [events, setEvents] = useState([])
  const [resetToken, setResetToken] = useState(0)
  const [reviewPly, setReviewPlyState] = useState(0)

  if (!piecesRef.current) piecesRef.current = pieces

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const setPieces = useCallback((p) => {
    piecesRef.current = p
    setPiecesState(p)
  }, [])

  // several listeners can watch the player's moves (online sync, puzzles) — keyed so they never clash
  const setMoveHandler = useCallback((fn, key = 'online') => {
    const h = { ...moveHandlerRef.current }
    if (fn) h[key] = fn
    else delete h[key]
    moveHandlerRef.current = h
  }, [])

  /* ------------------------------ finish ------------------------------ */
  const finish = useCallback((winner, reason) => {
    setPhase('over')
    setResult({ winner, reason })
    setThinking(false)
    setSelected(null)
    setPendingPromo(null)
    engineRef.current?.stop()
    if (reason !== 'checkmate') play(reason === 'timeout' || reason === 'resignation' || reason === 'abandoned' ? 'mate' : 'draw')
  }, [])

  const resetVisuals = useCallback(() => {
    setEvents([])
    setResetToken((t) => t + 1)
  }, [])

  /* ------------------------------ new game ------------------------------ */
  const startGame = useCallback(
    (cfg) => {
      engineRef.current?.stop()
      chessRef.current = cfg.fen ? new Chess(cfg.fen) : new Chess()
      const p = buildPieces(chessRef.current)
      snaps.current = []
      setPieces(p)
      setMoves([])
      setSelected(null)
      setLastMove(null)
      setResult(null)
      setPendingPromo(null)
      setThinking(false)
      setTurn(chessRef.current.turn())
      setInCheck(chessRef.current.inCheck())
      setSettings(cfg)
      settingsRef.current = cfg
      const base = cfg.time?.base ?? null
      clocksRef.current = { w: base, b: base }
      setClocks({ w: base, b: base })
      resetVisuals()
      setPhase('playing')
      if (!cfg.silent) play('start')

      if (cfg.mode === 'bot') {
        if (!engineRef.current) engineRef.current = new Engine()
        setEngineError(false)
        engineRef.current.init().catch(() => setEngineError(true))
      }
    },
    [setPieces, resetVisuals],
  )

  /* ------------------------------ make a move ------------------------------ */
  const doMove = useCallback(
    ({ from, to, promotion }, source = 'human') => {
      const chess = chessRef.current
      let m
      try {
        m = chess.move({ from, to, promotion })
      } catch {
        return null
      }
      if (!m) return null
      const before = piecesRef.current
      snaps.current.push(before)
      const after = applyMove(before, m)
      setPieces(after)
      const ev = buildEvent(++eventId.current, before, m, chess, after)
      setEvents((l) => [...l, ev])
      setMoves(chess.history({ verbose: true }))
      setLastMove({ from: m.from, to: m.to })
      setSelected(null)
      setPendingPromo(null)
      setTurn(chess.turn())
      setInCheck(chess.inCheck())

      const st = settingsRef.current
      if (clocksRef.current[m.color] != null && st?.clockMode !== 'external') {
        clocksRef.current[m.color] += st?.time?.inc || 0
        setClocks({ ...clocksRef.current })
      }

      let over = null
      if (chess.isCheckmate()) over = [m.color, 'checkmate']
      else if (chess.isStalemate()) over = [null, 'stalemate']
      else if (chess.isInsufficientMaterial()) over = [null, 'insufficient material']
      else if (chess.isThreefoldRepetition()) over = [null, 'threefold repetition']
      else if (chess.isDraw()) over = [null, '50-move rule']
      if (over) finish(over[0], over[1])
      haptic(m.captured ? 25 : 12)

      if (source === 'human') {
        Object.values(moveHandlerRef.current).forEach((h) => h(m, { fen: chess.fen(), over, history: chess.history() }))
      }
      return m
    },
    [finish, setPieces],
  )

  const applyMoveUci = useCallback(
    (uci, source = 'remote') => {
      const chess = chessRef.current
      const legal = chess.moves({ verbose: true }).find((m) => m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && (m.promotion || '') === (uci[4] || ''))
      if (!legal) return null
      return doMove({ from: legal.from, to: legal.to, promotion: legal.promotion }, source)
    },
    [doMove],
  )

  // rebuild a game silently from a move list (rejoin / resync)
  const loadMoves = useCallback(
    (ucis, cfg) => {
      engineRef.current?.stop()
      const chess = cfg.fen ? new Chess(cfg.fen) : new Chess()
      let p = buildPieces(chess)
      const stack = []
      for (const u of ucis) {
        const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
        stack.push(p)
        p = applyMove(p, mv)
      }
      chessRef.current = chess
      snaps.current = stack
      setPieces(p)
      const hist = chess.history({ verbose: true })
      setMoves(hist)
      const last = hist[hist.length - 1]
      setLastMove(last ? { from: last.from, to: last.to } : null)
      setSelected(null)
      setPendingPromo(null)
      setTurn(chess.turn())
      setInCheck(chess.inCheck())
      setSettings(cfg)
      settingsRef.current = cfg
      setResult(null)
      setPhase('playing')
      resetVisuals()
    },
    [setPieces, resetVisuals],
  )

  const externalFinish = useCallback(
    (winner, reason) => {
      if (phase === 'over') return
      finish(winner, reason)
    },
    [finish, phase],
  )

  const setExternalClocks = useCallback((c) => {
    clocksRef.current = { ...c }
    setClocks({ ...c })
  }, [])

  /* ------------------------------ input ------------------------------ */
  const myTurnOnly = settings && settings.mode !== 'local'
  const canMove = phase === 'playing' && !pendingPromo && !(myTurnOnly && turn !== settings.playerColor)

  const targets = useMemo(() => {
    if (!selected || !canMove) return []
    return chessRef.current.moves({ square: selected, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured }))
  }, [selected, canMove, moves.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSquare = useCallback(
    (sq) => {
      if (!canMove) return
      const chess = chessRef.current
      if (selected) {
        const cands = chess.moves({ square: selected, verbose: true }).filter((m) => m.to === sq)
        if (cands.length) {
          if (cands[0].promotion) {
            setPendingPromo({ from: selected, to: sq })
            return
          }
          doMove(cands[0], 'human')
          return
        }
      }
      const p = chess.get(sq)
      if (p && p.color === chess.turn()) {
        setSelected(sq === selected ? null : sq)
        if (sq !== selected) play('select')
      } else {
        setSelected(null)
      }
    },
    [canMove, selected, doMove],
  )

  const choosePromotion = useCallback(
    (type) => {
      if (!pendingPromo) return
      doMove({ from: pendingPromo.from, to: pendingPromo.to, promotion: type }, 'human')
    },
    [pendingPromo, doMove],
  )
  const cancelPromotion = useCallback(() => setPendingPromo(null), [])

  /* ------------------------------ bot ------------------------------ */
  useEffect(() => {
    if (phase !== 'playing' || settings?.mode !== 'bot' || pendingPromo) return
    if (turn === settings.playerColor) return
    let cancelled = false
    setThinking(true)
    const level = LEVELS.find((l) => l.id === settings.level) || LEVELS[1]
    const t0 = performance.now()
    ;(async () => {
      let uci = null
      try {
        uci = await engineRef.current.bestMove(chessRef.current.fen(), level)
      } catch {
        setEngineError(true)
      }
      if (cancelled) return
      const legal = chessRef.current.moves({ verbose: true })
      if (!legal.length) return
      let mv = null
      if (uci && Math.random() >= level.blunder) {
        mv = legal.find((m) => m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && (m.promotion || '') === (uci[4] || ''))
      }
      if (!mv) mv = legal[Math.floor(Math.random() * legal.length)]
      await sleep(Math.max(0, 550 - (performance.now() - t0)))
      if (cancelled) return
      setThinking(false)
      doMove({ from: mv.from, to: mv.to, promotion: mv.promotion }, 'bot')
    })()
    return () => {
      cancelled = true
      setThinking(false)
      engineRef.current?.stop()
    }
  }, [phase, turn, settings, pendingPromo, doMove])

  /* ------------------------------ clocks (local games) ------------------------------ */
  useEffect(() => {
    if (phase !== 'playing' || settings?.time?.base == null || settings?.clockMode === 'external') return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      const side = chessRef.current.turn()
      clocksRef.current[side] = Math.max(0, clocksRef.current[side] - dt)
      setClocks({ ...clocksRef.current })
      if (clocksRef.current[side] <= 0) finish(side === 'w' ? 'b' : 'w', 'timeout')
    }, 100)
    return () => clearInterval(id)
  }, [phase, settings, finish])

  /* ------------------------------ undo / resign ------------------------------ */
  const undo = useCallback(() => {
    if (phase !== 'playing') return
    const st = settingsRef.current
    if (st?.mode === 'online') return
    const chess = chessRef.current
    if (!chess.history().length) return
    let plies = 1
    if (st?.mode === 'bot' && chess.turn() === st.playerColor) plies = 2
    plies = Math.min(plies, chess.history().length)
    engineRef.current?.stop()
    for (let i = 0; i < plies; i++) {
      chess.undo()
      const prev = snaps.current.pop()
      if (prev) piecesRef.current = prev
    }
    setPieces(piecesRef.current)
    const hist = chess.history({ verbose: true })
    setMoves(hist)
    const last = hist[hist.length - 1]
    setLastMove(last ? { from: last.from, to: last.to } : null)
    setSelected(null)
    setTurn(chess.turn())
    setInCheck(chess.inCheck())
    resetVisuals()
    play('select')
  }, [phase, setPieces, resetVisuals])

  const resign = useCallback(() => {
    if (phase !== 'playing') return
    const chess = chessRef.current
    const st = settingsRef.current
    const loser = st?.mode === 'local' ? chess.turn() : st?.playerColor || chess.turn()
    finish(loser === 'w' ? 'b' : 'w', 'resignation')
  }, [phase, finish])

  /* ------------------------------ review (step through a finished game) ------------------------------ */
  const startReview = useCallback(
    (ucis, cfg = {}) => {
      engineRef.current?.stop()
      const chess = cfg.fen ? new Chess(cfg.fen) : new Chess()
      let p = buildPieces(chess)
      const snapsR = [p]
      const mv = []
      const fens = [chess.fen()]
      for (const u of ucis) {
        const m = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
        p = applyMove(p, m)
        snapsR.push(p)
        mv.push(m)
        fens.push(chess.fen())
      }
      reviewRef.current = { snaps: snapsR, moves: mv, fens }
      chessRef.current = new Chess(cfg.fen || undefined)
      setSettings({ mode: 'review', playerColor: cfg.playerColor || 'w' })
      setPhase('review')
      setResult(null)
      setSelected(null)
      setPendingPromo(null)
      setThinking(false)
      setMoves(mv)
      setPieces(snapsR[0])
      setLastMove(null)
      setTurn(new Chess(fens[0]).turn())
      setInCheck(false)
      setReviewPlyState(0)
      resetVisuals()
    },
    [setPieces, resetVisuals],
  )

  const setReviewPly = useCallback(
    (i) => {
      const r = reviewRef.current
      const n = Math.max(0, Math.min(r.snaps.length - 1, i))
      setPieces(r.snaps[n])
      const m = r.moves[n - 1]
      setLastMove(m ? { from: m.from, to: m.to } : null)
      const c = new Chess(r.fens[n])
      setTurn(c.turn())
      setInCheck(c.inCheck())
      setReviewPlyState(n)
      play(m ? (m.captured ? 'capture' : 'move') : 'select')
    },
    [setPieces],
  )

  // free the engine worker when the app unmounts
  useEffect(() => () => engineRef.current?.destroy(), [])

  const checkSquare = useMemo(() => {
    if (!inCheck) return null
    const k = pieces.find((p) => p.type === 'k' && p.color === turn && !p.captured)
    return k ? k.square : null
  }, [inCheck, pieces, turn])

  const captured = useMemo(
    () => ({
      w: pieces.filter((p) => p.captured && p.color === 'w').map((p) => p.type),
      b: pieces.filter((p) => p.captured && p.color === 'b').map((p) => p.type),
    }),
    [pieces],
  )

  const getChess = useCallback(() => chessRef.current, [])

  // best move for the side to move (works offline: Stockfish runs on the device)
  const getHint = useCallback(async () => {
    if (!engineRef.current) engineRef.current = new Engine()
    await engineRef.current.init()
    return engineRef.current.bestMove(chessRef.current.fen(), { skill: 20, depth: 14, time: 700 })
  }, [])

  return {
    pieces,
    moves,
    selected,
    targets,
    lastMove,
    phase,
    result,
    settings,
    pendingPromo,
    thinking,
    clocks,
    engineError,
    turn,
    inCheck,
    checkSquare,
    captured,
    canMove,
    events,
    resetToken,
    reviewPly,
    startGame,
    doMove,
    applyMoveUci,
    loadMoves,
    externalFinish,
    setExternalClocks,
    setMoveHandler,
    onSquare,
    choosePromotion,
    cancelPromotion,
    undo,
    resign,
    startReview,
    setReviewPly,
    getChess,
    getHint,
  }
}
