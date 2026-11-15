import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../firebase/api.js'

const LS_ACTIVE = 'chess3d.activeGame'

const uciOf = (m) => m.from + m.to + (m.promotion || '')

// Glues one Firestore game document to the local game engine.
export function useOnline({ game, profile, refreshProfile }) {
  const [code, setCode] = useState(null)
  const [g, setG] = useState(null)
  const [error, setError] = useState(null)
  const [queueing, setQueueing] = useState(false)
  const [settled, setSettled] = useState(null)
  const [resumeCode, setResumeCode] = useState(null)
  const [now, setNow] = useState(0)
  const [rematchCode, setRematchCode] = useState(null)

  const gameRef = useRef(game)
  gameRef.current = game
  const gRef = useRef(null)
  gRef.current = g
  const profRef = useRef(profile)
  profRef.current = profile
  const started = useRef(null) // code that was set up locally
  const flagged = useRef(false)
  const settling = useRef(false)
  const unsub = useRef(null)
  const queueUnsub = useRef(null)
  const poll = useRef(null)

  const uid = profile?.uid
  const color = g && uid ? (g.white?.uid === uid ? 'w' : g.black?.uid === uid ? 'b' : null) : null

  /* ---------------- subscribe to the room ---------------- */
  const open = useCallback(async (c) => {
    unsub.current?.()
    started.current = null
    flagged.current = false
    settling.current = false
    setSettled(null)
    setRematchCode(null)
    setError(null)
    setG(null)
    setCode(c)
    try {
      localStorage.setItem(LS_ACTIVE, c)
    } catch {
      /* ignore */
    }
    unsub.current = await api.subscribeGame(
      c,
      (d) => {
        if (!d) {
          setError('This room no longer exists.')
          setG(null)
          return
        }
        setG(d)
      },
      (e) => setError(e.message || 'Connection problem'),
    )
  }, [])

  const leave = useCallback(() => {
    unsub.current?.()
    unsub.current = null
    started.current = null
    setCode(null)
    setG(null)
    setSettled(null)
    setRematchCode(null)
    try {
      localStorage.removeItem(LS_ACTIVE)
    } catch {
      /* ignore */
    }
  }, [])

  /* ---------------- sync document -> engine ---------------- */
  useEffect(() => {
    if (!g || !color || g.status === 'waiting') return
    const gm = gameRef.current
    const cfg = { mode: 'online', playerColor: color, time: g.tc.base == null ? { id: 'inf', base: null, inc: 0 } : g.tc, clockMode: 'external', silent: true }
    if (started.current !== g.code) {
      started.current = g.code
      if (g.moves.length) gm.loadMoves(g.moves, cfg)
      else gm.startGame(cfg)
    } else {
      const chess = gm.getChess()
      const local = chess.history({ verbose: true }).map(uciOf)
      let ok = true
      for (let i = 0; i < Math.min(local.length, g.moves.length); i++) if (local[i] !== g.moves[i]) ok = false
      if (!ok) gm.loadMoves(g.moves, cfg)
      else if (g.moves.length > local.length) {
        for (let i = local.length; i < g.moves.length; i++) {
          if (!gm.applyMoveUci(g.moves[i], 'remote')) {
            gm.loadMoves(g.moves, cfg)
            break
          }
        }
      }
    }
    if (g.status === 'finished' && gm.phase !== 'over') gm.externalFinish(g.result?.winner ?? null, g.result?.reason || 'game over')
  }, [g, color])

  // finished -> settle Elo/history once
  useEffect(() => {
    if (!g || g.status !== 'finished' || !uid || !color || settling.current) return
    settling.current = true
    api
      .settleGame(g.code, uid)
      .then((r) => {
        if (r) setSettled(r)
        refreshProfile?.()
      })
      .catch((e) => console.warn('settle failed', e))
    try {
      localStorage.removeItem(LS_ACTIVE)
    } catch {
      /* ignore */
    }
  }, [g, uid, color, refreshProfile])

  // rematch offered by the opponent
  useEffect(() => {
    if (g?.rematch && g.rematch !== code) setRematchCode(g.rematch)
  }, [g, code])

  /* ---------------- local move -> document ---------------- */
  useEffect(() => {
    const gm = gameRef.current
    if (!code || !uid) {
      gm.setMoveHandler(null)
      return
    }
    gm.setMoveHandler((m, { over, history }) => {
      const cur = gRef.current
      if (!cur || cur.status !== 'active') return
      const count = history.length - 1
      api.submitMove(cur.code, uid, uciOf(m), count, over).catch(() => {
        // out of sync: rebuild from the document
        const d = gRef.current
        if (d) started.current = null
        setG((x) => (x ? { ...x } : x))
      })
    })
    return () => gm.setMoveHandler(null)
  }, [code, uid])

  /* ---------------- clocks, flags, presence ---------------- */
  useEffect(() => {
    if (!g || g.status !== 'active' || !color) return
    const id = setInterval(() => {
      const t = api.serverNow()
      setNow(t)
      const w = api.remainingFor(g, 'w', t)
      const b = api.remainingFor(g, 'b', t)
      if (w != null) gameRef.current.setExternalClocks({ w, b })
      const turn = g.moves.length % 2 === 0 ? 'w' : 'b'
      const left = turn === 'w' ? w : b
      if (left != null && left <= 0 && !flagged.current) {
        flagged.current = true
        api.flagGame(g.code, turn).catch(() => {
          flagged.current = false
        })
      }
    }, 200)
    return () => clearInterval(id)
  }, [g, color])

  useEffect(() => {
    if (!g || !color || (g.status !== 'active' && g.status !== 'waiting')) return
    const beat = () => api.heartbeat(g.code, color)
    beat()
    const id = setInterval(beat, 15000)
    return () => clearInterval(id)
  }, [g?.code, g?.status, color]) // eslint-disable-line react-hooks/exhaustive-deps

  const oppSeen = g && color ? (color === 'w' ? g.seenB : g.seenW) : null
  const oppAway = !!(g && g.status === 'active' && g.moves.length >= 0 && now && now - (oppSeen || g.lastMoveAt || now) > 45000)

  /* ---------------- actions ---------------- */
  const create = useCallback(
    async (tc, colorPref) => {
      setError(null)
      try {
        const c = await api.createGame(profRef.current, { tc, color: colorPref })
        await open(c)
        return c
      } catch (e) {
        setError(e.message)
        return null
      }
    },
    [open],
  )

  const join = useCallback(
    async (raw) => {
      setError(null)
      try {
        const c = await api.joinGame(profRef.current, raw)
        await open(c)
        return c
      } catch (e) {
        setError(e.message)
        return null
      }
    },
    [open],
  )

  const stopQueue = useCallback(() => {
    queueUnsub.current?.()
    queueUnsub.current = null
    clearInterval(poll.current)
    setQueueing(false)
  }, [])

  const cancelQueue = useCallback(() => {
    stopQueue()
    if (profRef.current) api.leaveQueue(profRef.current.uid)
  }, [stopQueue])

  const quickMatch = useCallback(
    async (tc) => {
      setError(null)
      const p = profRef.current
      setQueueing(true)
      try {
        await api.joinQueue(p, tc.id)
        queueUnsub.current = await api.watchQueue(p.uid, async (q) => {
          if (q?.matched) {
            stopQueue()
            await api.setActiveGame(p.uid, q.matched)
            await open(q.matched)
            api.leaveQueue(p.uid)
          }
        })
        const attempt = async () => {
          const c = await api.tryPair(profRef.current, tc)
          if (c) {
            /* the queue watcher opens it */
          }
        }
        attempt()
        poll.current = setInterval(attempt, 4000)
      } catch (e) {
        setError(e.message)
        stopQueue()
      }
    },
    [open, stopQueue],
  )

  useEffect(
    () => () => {
      unsub.current?.()
      queueUnsub.current?.()
      clearInterval(poll.current)
    },
    [],
  )

  // is there an unfinished game to come back to?
  const checkResume = useCallback(async () => {
    const p = profRef.current
    if (!p) return
    let c = p.activeGame
    try {
      c = c || localStorage.getItem(LS_ACTIVE)
    } catch {
      /* ignore */
    }
    if (!c) return setResumeCode(null)
    try {
      const { db, fs } = await api.load()
      const s = await fs.getDoc(fs.doc(db, 'games', c))
      const d = s.exists() ? s.data() : null
      if (d && d.status === 'active' && (d.players || []).includes(p.uid)) setResumeCode(c)
      else setResumeCode(null)
    } catch {
      setResumeCode(null)
    }
  }, [])

  const resign = useCallback(() => g && color && api.resignGame(g.code, color), [g, color])
  const offerDraw = useCallback(() => g && color && api.offerDraw(g.code, color), [g, color])
  const answerDraw = useCallback((yes) => (yes ? api.acceptDraw(g.code) : api.declineDraw(g.code)), [g])
  const claimWin = useCallback(() => g && color && api.claimAbandon(g.code, color), [g, color])
  const rematch = useCallback(async () => {
    if (!g || !color) return
    if (rematchCode) {
      await join(rematchCode)
      return
    }
    const c = await api.createRematch(profRef.current, g, color)
    setRematchCode(null)
    await open(c)
  }, [g, color, rematchCode, join, open])
  const cancelRoom = useCallback(async () => {
    if (code && g?.status === 'waiting') await api.cancelRoom(code)
    await api.setActiveGame(profRef.current.uid, null)
    leave()
  }, [code, g, leave])

  return {
    code,
    g,
    color,
    error,
    setError,
    queueing,
    settled,
    resumeCode,
    rematchCode,
    oppAway,
    drawOffered: !!(g && g.drawOffer && g.drawOffer !== color && g.status === 'active'),
    drawSent: !!(g && g.drawOffer && g.drawOffer === color && g.status === 'active'),
    waiting: !!(g && g.status === 'waiting'),
    inRoom: !!code,
    create,
    join,
    open,
    leave,
    quickMatch,
    cancelQueue,
    checkResume,
    resign,
    offerDraw,
    answerDraw,
    claimWin,
    rematch,
    cancelRoom,
  }
}
