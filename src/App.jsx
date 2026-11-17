import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Scene from './three/Scene.jsx'
import { TIERS, buildMaterials, buildTheme } from './three/materials.js'
import { GameOver, MoveList, PlayerBar, PromotionDialog } from './ui/Hud.jsx'
import { Shop } from './ui/Shop.jsx'
import { Icon, PieceIcon } from './ui/Icons.jsx'
import { ChatPanel, ChatPreview, ReactionFloat } from './ui/Chat.jsx'
import { verifyPayment } from './shop/api.js'
import { BY_ID, FREE_IDS } from './data/catalog.js'
import { AuthSheet, Friends, Home, Leaderboard, OnlineSheet, Profile, PuzzleSheet, Settings, Setup } from './ui/Screens.jsx'
import { PuzzlePanel, ReviewPanel } from './ui/Panels.jsx'
import { applyWoodTheme } from './ui/wood.js'
import { LEVELS } from './game/engine.js'
import { TIME_CONTROLS, useChessGame } from './game/useChessGame.js'
import { analyzeGame, uciToSan } from './game/review.js'
import { ImportSheet } from './ui/ImportSheet.jsx'
import { loadImported, mergeImported, saveImported } from './lib/importers.js'
import { useAuth } from './online/useAuth.js'
import { useOnline } from './online/useOnline.js'
import { getInventory, saveBotGame } from './firebase/api.js'
import * as api from './firebase/api.js'
import PUZZLES from './data/puzzles.json'
import { detectTier, resolveTier, stepDown } from './lib/quality.js'
import { play, setMuted } from './lib/sound.js'
import { eloDelta } from './lib/elo.js'
import { useOnlineStatus } from './lib/useOnlineStatus.js'

export const APP_NAME = 'Chess 3D'

const PREF_KEY = 'chess3d.prefs.v1'
const PUZ_KEY = 'chess3d.puzzles.v1'
const HIST_KEY = 'chess3d.history.v1'
const BOT_KEY = 'chess3d.botrating.v1'
const DEFAULT_PREFS = { color: 'w', level: 'casual', time: 'inf', graphics: 'auto', sound: true, autoFlip: true, hands: true, chat: true, board: 'board_classic', pieces: 'set_classic' }
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const read = (k, d) => {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }
  } catch {
    return d
  }
}
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
const uciOf = (m) => m.from + m.to + (m.promotion || '')

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err) {
    console.error('3D scene failed, switching to 2D', err)
    this.props.onFail?.()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

// Room materials depend on the quality tier; board + piece materials also on the equipped theme.
// The old theme stays on screen until the new one is ready, so switching never flashes.
function useThemedMaterials(tier, enabled, boardId, setId) {
  const [base, setBase] = useState(null)
  const [theme, setTheme] = useState(null)
  const oldTheme = useRef(null)
  useEffect(() => {
    if (!enabled) return
    let dispose = null
    let cancelled = false
    setBase(null)
    buildMaterials(tier)
      .then((b) => {
        if (cancelled) return b.dispose()
        dispose = b.dispose
        setBase(b.materials)
      })
      .catch((e) => console.error('materials failed', e))
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [tier, enabled])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    buildTheme(tier, boardId, setId)
      .then((t) => {
        if (cancelled) return t.dispose()
        const prev = oldTheme.current
        oldTheme.current = t
        setTheme(t.theme)
        if (prev) setTimeout(prev.dispose, 400)
      })
      .catch((e) => console.error('theme failed', e))
    return () => {
      cancelled = true
    }
  }, [tier, enabled, boardId, setId])
  useEffect(() => () => oldTheme.current?.dispose(), [])
  return useMemo(() => (base && theme ? { ...base, ...theme } : null), [base, theme])
}

const dayPuzzle = () => PUZZLES[Math.floor(Date.now() / 864e5) % PUZZLES.length]

export default function App() {
  const game = useChessGame()
  const auth = useAuth()

  const [prefs, setPrefsState] = useState(() => {
    const p = read(PREF_KEY, DEFAULT_PREFS)
    return p.graphics === '2d' ? { ...p, graphics: 'low' } : p // 2D mode was removed
  })
  const online = useOnline({ game, profile: auth.profile, refreshProfile: auth.refreshProfile, chatOn: prefs.chat !== false })
  const [incoming, setIncoming] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const [chatPrev, setChatPrev] = useState(null)
  const [sheet, setSheet] = useState('home') // null = in game
  const [afterAuth, setAfterAuth] = useState('home')
  const [authReason, setAuthReason] = useState(null)
  const [movesOpen, setMovesOpen] = useState(false)
  const [overDismissed, setOverDismissed] = useState(false)
  const [manualFlip, setManualFlip] = useState(false)
  const [autoTierName, setAutoTierName] = useState(() => detectTier())
  const [sceneFailed, setSceneFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mateShown, setMateShown] = useState(false)
  const [flash, setFlash] = useState(0)
  const [toast, setToast] = useState(null)
  // one tiny listener for direct challenges addressed to me
  useEffect(() => {
    const uid = auth.profile?.uid
    if (!uid) return
    let off = null
    let dead = false
    api.subscribeChallenge(uid, (c) => setIncoming(c && c.at && Date.now() - c.at < 5 * 60000 ? c : null)).then((u) => (dead ? u() : (off = u)))
    return () => {
      dead = true
      off?.()
    }
  }, [auth.profile?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
  // keep the push token fresh when notifications were already allowed
  useEffect(() => {
    const uid = auth.profile?.uid
    const key = import.meta.env.VITE_VAPID_KEY
    if (!uid || !key || prefs.push === false || !api.pushSupported() || Notification.permission !== 'granted') return
    api.registerPush(uid, key).catch(() => {})
  }, [auth.profile?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
  const chatOn = prefs.chat !== false
  // unread counter + short preview of the newest message from the opponent
  const msgs = online.messages
  useEffect(() => {
    if (chatOpen) setSeenCount(msgs.length)
  }, [chatOpen, msgs.length])
  useEffect(() => {
    const last = msgs[msgs.length - 1]
    if (!last || chatOpen || last.uid === auth.profile?.uid) return
    setChatPrev(last)
    const t = setTimeout(() => setChatPrev(null), 4500)
    return () => clearTimeout(t)
  }, [msgs.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!online.code) {
      setChatOpen(false)
      setSeenCount(0)
    }
  }, [online.code])
  const isOnline = useOnlineStatus()
  const [botRating, setBotRating] = useState(() => read(BOT_KEY, { rating: 1000, games: 0 }))
  const [botSettled, setBotSettled] = useState(null)
  const [pz, setPz] = useState(null)
  const [imported, setImported] = useState(loadImported)
  const addImported = useCallback((list) => setImported((p) => { const n = mergeImported(p, list); saveImported(n); return n }), [])
  const [pzProgress, setPzProgress] = useState(() => read(PUZ_KEY, { solved: [], rating: 1000, streak: 0 }))
  const [review, setReview] = useState({ analysis: null, progress: 0 })
  const [localHistory, setLocalHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HIST_KEY) || '[]')
    } catch {
      return []
    }
  })

  const setPrefs = useCallback((p) => {
    setPrefsState(p)
    write(PREF_KEY, p)
  }, [])
  const say = useCallback((t) => {
    setToast(t)
    setTimeout(() => setToast((x) => (x === t ? null : x)), 3500)
  }, [])

  useEffect(() => setMuted(!prefs.sound), [prefs.sound])
  useEffect(() => {
    const id = setTimeout(applyWoodTheme, 30)
    return () => clearTimeout(id)
  }, [])

  const unsupported = autoTierName === 'none' || sceneFailed
  const no3d = unsupported
  const tier = useMemo(() => resolveTier(prefs.graphics, autoTierName === 'none' ? 'low' : autoTierName), [prefs.graphics, autoTierName])
  // ---- shop: what the player owns / has equipped / is previewing
  const [inventory, setInventory] = useState([])
  const [preview, setPreview] = useState(null) // { id, kind }
  const [shopNotice, setShopNotice] = useState(null)
  const owned = useMemo(() => new Set([...FREE_IDS, ...inventory]), [inventory])
  const equipped = useMemo(
    () => ({ board: owned.has(prefs.board) ? prefs.board : 'board_classic', pieces: owned.has(prefs.pieces) ? prefs.pieces : 'set_classic' }),
    [owned, prefs.board, prefs.pieces],
  )
  const shownBoard = preview?.kind === 'board' ? preview.id : equipped.board
  const shownPieces = preview?.kind === 'pieces' ? preview.id : equipped.pieces
  const materials = useThemedMaterials(tier, !no3d, shownBoard, shownPieces)

  const { settings, phase } = game
  const handsReal = !no3d && prefs.hands && tier.hands
  const onPlace = useCallback((ev) => {
    play(ev.sound)
    if (ev.check && !ev.mate) setFlash((n) => n + 1)
  }, [])
  const lastEv = game.events[game.events.length - 1]
  useEffect(() => {
    if (lastEv && !handsReal) onPlace(lastEv)
  }, [lastEv]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!game.events.length) setMateShown(false)
  }, [game.events.length])

  if (typeof window !== 'undefined' && location.search.includes('debug')) {
    window.__game = game
    window.__online = online
    window.__auth = auth
    window.__busy = busy
    window.__preview = setPreview
  }

  /* ------------------------------ navigation ------------------------------ */
  const nav = (t) => {
    if (['online', 'quick', 'leaderboard', 'friends'].includes(t) && !auth.profile) {
      setAfterAuth(t)
      setAuthReason(null)
      setSheet('auth')
      return
    }
    setSheet(t)
  }
  const gameVisible = sheet === null
  const inGame = phase === 'playing' || phase === 'over'
  const puzzleMode = settings?.mode === 'puzzle'
  const reviewMode = phase === 'review'
  const onlineMode = settings?.mode === 'online'
  const botMode = settings?.mode === 'bot'

  // online game just started / synced -> show the board
  const shownFor = useRef(null)
  useEffect(() => {
    const g = online.g
    if (g && g.status !== 'waiting' && online.color && shownFor.current !== g.code) {
      shownFor.current = g.code
      setSheet(null)
      setOverDismissed(false)
      setManualFlip(false)
      setMovesOpen(false)
    }
  }, [online.g, online.color])

  // check for an unfinished online game once signed in
  useEffect(() => {
    if (auth.profile) online.checkResume()
  }, [auth.profile?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshInventory = useCallback(async () => {
    if (!auth.profile) return setInventory([])
    try {
      setInventory(await getInventory(auth.profile.uid))
    } catch {
      /* offline: keep what we have */
    }
  }, [auth.profile?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    refreshInventory()
  }, [refreshInventory])

  // returning from Paystack: ?paid=REFERENCE
  const pendingPaid = useRef(new URLSearchParams(location.search).get('paid'))
  useEffect(() => {
    const ref = pendingPaid.current
    if (!ref) return
    const clean = () => {
      const u = new URL(location.href)
      u.searchParams.delete('paid')
      u.searchParams.delete('trxref')
      u.searchParams.delete('reference')
      history.replaceState(null, '', u.pathname + u.search)
    }
    if (ref === 'cancelled') {
      pendingPaid.current = null
      clean()
      say('Payment cancelled.')
      return
    }
    if (!auth.profile) {
      if (auth.ready) {
        setAfterAuth('shop')
        setAuthReason('Sign in to confirm your payment and unlock your items.')
        setSheet('auth')
      }
      return
    }
    pendingPaid.current = null
    clean()
    setSheet('shop')
    setShopNotice('Confirming your payment…')
    let tries = 0
    const check = async () => {
      try {
        const r = await verifyPayment(ref)
        if (r.status === 'paid') {
          await refreshInventory()
          setShopNotice('Payment confirmed. Your items are unlocked. Tap Equip to use them.')
          return
        }
        if (r.status === 'pending' && ++tries < 6) return setTimeout(check, 2500)
        setShopNotice('Payment not completed. If you were charged, it will unlock automatically in a few minutes.')
      } catch (e) {
        setShopNotice(e.message)
      }
    }
    check()
  }, [auth.profile, auth.ready, refreshInventory, say])

  // invite link ?join=CODE
  const pendingJoin = useRef(new URLSearchParams(location.search).get('join'))
  useEffect(() => {
    if (!pendingJoin.current) return
    if (auth.profile) {
      const c = pendingJoin.current
      pendingJoin.current = null
      {
        const u = new URL(location.href)
        u.searchParams.delete('join')
        history.replaceState(null, '', u.pathname + u.search)
      }
      online.join(c).then((ok) => !ok && setSheet('online'))
    } else if (auth.ready) {
      setAfterAuth('home')
      setAuthReason('Sign in (or play as a guest) to join your friend’s game.')
      setSheet('auth')
    }
  }, [auth.profile, auth.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (online.error && gameVisible) say(online.error)
  }, [online.error]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ starting games ------------------------------ */
  const resetUi = () => {
    setManualFlip(false)
    setOverDismissed(false)
    setMovesOpen(false)
    setPz(null)
  }

  const startLocal = (mode) => {
    const color = prefs.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.color
    const time = TIME_CONTROLS.find((t) => t.id === prefs.time) || TIME_CONTROLS[0]
    resetUi()
    setBotSettled(null)
    setSheet(null)
    game.startGame({ mode, playerColor: mode === 'bot' ? color : 'w', level: prefs.level, time })
  }

  const rematch = () => {
    if (onlineMode) return online.rematch()
    if (!settings) return
    resetUi()
    setBotSettled(null)
    game.startGame({ ...settings, playerColor: botMode ? (settings.playerColor === 'w' ? 'b' : 'w') : 'w' })
  }

  /* ------------------------------ history ------------------------------ */
  const savedFor = useRef(null)
  useEffect(() => {
    if (phase !== 'over' || !game.result || !settings || (settings.mode !== 'bot' && settings.mode !== 'local')) return
    const key = game.moves.map((m) => m.san).join(' ') + game.result.reason
    if (savedFor.current === key) return
    savedFor.current = key
    const me = settings.mode === 'bot' ? settings.playerColor : 'w'
    const w = game.result.winner
    const rec = {
      mode: settings.mode,
      level: settings.level,
      opp: settings.mode === 'bot' ? `Stockfish ${LEVELS.find((l) => l.id === settings.level)?.name}` : 'Pass & play',
      color: me,
      result: w == null ? 'draw' : w === me ? 'win' : 'loss',
      reason: game.result.reason,
      moves: game.moves.map(uciOf),
      at: Date.now(),
    }
    if (settings.mode === 'bot') {
      const lvl = LEVELS.find((l) => l.id === settings.level)
      const score = w == null ? 0.5 : w === me ? 1 : 0
      const delta = eloDelta(botRating.rating, lvl.rating, score, botRating.games)
      const nb = { rating: Math.max(100, botRating.rating + delta), games: botRating.games + 1 }
      setBotRating(nb)
      write(BOT_KEY, nb)
      setBotSettled({ delta, rating: nb.rating, rated: true })
      rec.delta = delta
    }
    const list = [rec, ...localHistory].slice(0, 30)
    setLocalHistory(list)
    write(HIST_KEY, list)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // offline bot games are uploaded to the account once we are online again
  useEffect(() => {
    if (!auth.profile || !isOnline) return
    const todo = localHistory.filter((h) => h.mode === 'bot' && !h.synced)
    if (!todo.length) return
    let dead = false
    ;(async () => {
      const done = new Set()
      for (const h of todo) {
        try {
          const { synced, ...rec } = h // eslint-disable-line no-unused-vars
          await saveBotGame(auth.profile.uid, rec)
          done.add(h.at)
        } catch {
          break
        }
      }
      if (dead || !done.size) return
      const list = localHistory.map((h) => (done.has(h.at) ? { ...h, synced: true } : h))
      setLocalHistory(list)
      write(HIST_KEY, list)
    })()
    return () => {
      dead = true
    }
  }, [auth.profile?.uid, isOnline, localHistory.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const hint = async () => {
    if (phase !== 'playing' || game.thinking || game.turn !== playerColor) return
    say('Thinking…')
    try {
      const u = await game.getHint()
      if (!u) return say('No hint available')
      if (game.selected !== u.slice(0, 2)) game.onSquare(u.slice(0, 2))
      say(`Try ${uciToSan(game.getChess().fen(), u)}`)
    } catch {
      say('Hint unavailable right now')
    }
  }

  /* ------------------------------ review ------------------------------ */
  const abortRef = useRef(null)
  const startReview = useCallback(
    (ucis, color = 'w') => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      resetUi()
      setSheet(null)
      game.startReview(ucis, { playerColor: color })
      setReview({ analysis: null, progress: 0 })
      analyzeGame(ucis, null, (p) => setReview((r) => ({ ...r, progress: p })), ac.signal)
        .then((a) => a && !ac.signal.aborted && setReview({ analysis: a, progress: 1 }))
        .catch((e) => {
          console.warn('analysis failed', e)
          say('Analysis failed. Try again.')
        })
    },
    [game, say], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const reviewCurrent = () => startReview(game.moves.map(uciOf), settings?.playerColor || 'w')
  const reviewRecord = (h) => h.moves?.length && startReview(h.moves, h.color || 'w')
  const exitReview = () => {
    abortRef.current?.abort()
    setSheet('home')
  }

  /* ------------------------------ puzzles ------------------------------ */
  const pzRef = useRef(null)
  pzRef.current = pz
  const startPuzzle = useCallback(
    (p) => {
      resetUi()
      setSheet(null)
      setPz({ puzzle: p, status: 'solving', step: 0, hint: false, failed: false, assisted: false })
      game.startGame({ mode: 'puzzle', fen: p.fen, playerColor: p.side, silent: true, time: null })
    },
    [game], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (!puzzleMode) {
      game.setMoveHandler(null, 'puzzle')
      return
    }
    game.setMoveHandler((m, { over }) => {
      const z = pzRef.current
      if (!z || z.status !== 'solving') return
      const sol = z.puzzle.solution
      const last = z.step === sol.length - 1
      const ok = uciOf(m) === sol[z.step] || (last && over && over[1] === 'checkmate')
      if (ok) {
        if (last) {
          setPz({ ...z, status: 'solved' })
          const clean = !z.failed && !z.assisted && !z.hint
          setPzProgress((pr) => {
            const already = pr.solved.includes(z.puzzle.id)
            let { rating, streak } = pr
            const solved = clean && !already ? [...pr.solved, z.puzzle.id] : pr.solved
            if (!already) {
              const exp = 1 / (1 + Math.pow(10, (z.puzzle.rating - rating) / 400))
              rating = Math.max(400, rating + Math.round(24 * ((clean ? 1 : 0) - exp)))
              streak = clean ? streak + 1 : 0
            }
            const n = { solved, rating, streak }
            write(PUZ_KEY, n)
            return n
          })
        } else {
          setPz({ ...z, step: z.step + 2 })
          const reply = sol[z.step + 1]
          setTimeout(() => game.applyMoveUci(reply, 'bot'), 650)
        }
      } else {
        setPz({ ...z, status: 'wrong', failed: true })
        setTimeout(() => {
          game.undo()
          setPz((c) => (c && c.status === 'wrong' ? { ...c, status: 'solving' } : c))
        }, 1000)
      }
    }, 'puzzle')
    return () => game.setMoveHandler(null, 'puzzle')
  }, [puzzleMode, game.setMoveHandler]) // eslint-disable-line react-hooks/exhaustive-deps

  const nextPuzzle = () => {
    const i = PUZZLES.findIndex((p) => p.id === pz.puzzle.id)
    const rest = [...PUZZLES.slice(i + 1), ...PUZZLES.slice(0, i)]
    const open = rest.filter((p) => !pzProgress.solved.includes(p.id)).sort((a, b) => Math.abs(a.rating - pzProgress.rating) - Math.abs(b.rating - pzProgress.rating))
    startPuzzle(open[0] || rest[0] || pz.puzzle)
  }
  const puzzleHint = () => {
    if (!pz || pz.status !== 'solving') return
    const from = pz.puzzle.solution[pz.step].slice(0, 2)
    setPz({ ...pz, hint: true })
    game.onSquare(from)
  }
  const puzzleSolution = () => {
    if (!pz || pz.status !== 'solving') return
    setPz({ ...pz, assisted: true })
    pzRef.current = { ...pz, assisted: true }
    game.applyMoveUci(pz.puzzle.solution[pz.step], 'human')
  }

  /* ------------------------------ view ------------------------------ */
  const playing = inGame || puzzleMode || reviewMode
  const playerColor = settings?.mode === 'bot' || onlineMode || puzzleMode || reviewMode ? settings.playerColor : 'w'
  const baseSide = !playing ? 'w' : settings.mode === 'local' ? (prefs.autoFlip ? game.turn : 'w') : playerColor
  const viewSide = manualFlip ? (baseSide === 'w' ? 'b' : 'w') : baseSide

  const lost = game.captured
  const sum = (arr) => arr.reduce((s, t) => s + VALUE[t], 0)
  const whiteAdv = sum(lost.b) - sum(lost.w)
  const top = viewSide === 'w' ? 'b' : 'w'
  const bottom = viewSide
  const levelName = LEVELS.find((l) => l.id === settings?.level)?.name
  const nameOf = (c) => {
    if (onlineMode && online.g) {
      const s = online.g[c === 'w' ? 'white' : 'black']
      return s ? `${s.name}${s.uid === auth.profile?.uid ? ' (you)' : ''}` : 'Waiting…'
    }
    if (!settings) return c === 'w' ? 'White' : 'Black'
    if (botMode) return c === playerColor ? 'You' : `Stockfish · ${levelName}`
    return c === 'w' ? 'White' : 'Black'
  }
  const subOf = (c) => {
    if (onlineMode && online.g) {
      const s = online.g[c === 'w' ? 'white' : 'black']
      return `${c === 'w' ? 'White' : 'Black'}${s ? ' · ' + s.rating : ''}`
    }
    return c === 'w' ? 'White' : 'Black'
  }
  const barProps = (c) => ({
    name: nameOf(c),
    sub: subOf(c),
    color: c,
    clock: game.clocks[c],
    active: phase === 'playing' && game.turn === c,
    capturedTypes: c === 'w' ? lost.b : lost.w,
    advantage: Math.max(0, c === 'w' ? whiteAdv : -whiteAdv),
    thinking: game.thinking && botMode && c !== playerColor,
    away: onlineMode && online.oppAway && c !== online.color,
  })

  const sceneProps = {
    pieces: game.pieces,
    selected: game.selected,
    targets: game.targets,
    lastMove: game.lastMove,
    checkSquare: game.checkSquare,
    onSquare: (sq) => !busy && game.onSquare(sq),
    viewSide,
  }

  const statusText = (() => {
    if (pz) {
      if (pz.status === 'solved') return { t: 'Solved!', k: 'good' }
      if (pz.status === 'wrong') return { t: 'Not quite', k: 'bad' }
      return { t: game.inCheck ? 'Check!' : '', k: game.inCheck ? 'check' : '' }
    }
    if (phase !== 'playing') return { t: '' }
    if (botMode && game.turn !== playerColor) return { t: game.thinking ? 'Computer is thinking…' : '' }
    if (game.inCheck) return { t: 'Check!', k: 'check' }
    if (onlineMode) return { t: game.turn === online.color ? 'Your move' : 'Opponent’s move' }
    return { t: botMode ? 'Your move' : `${game.turn === 'w' ? 'White' : 'Black'} to move` }
  })()

  const showOver = phase === 'over' && game.result && !overDismissed && gameVisible && !puzzleMode && !busy && (game.result.reason !== 'checkmate' || mateShown || !handsReal)

  const shareUrl = (c) => `${location.origin}${location.pathname}?join=${c}`
  const goHome = () => {
    if (onlineMode && online.g?.status === 'finished') online.leave()
    setSheet('home')
  }
  const resumeOnline = online.resumeCode && !(online.g && online.g.status === 'active')

  if (unsupported) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="panel sheet" style={{ textAlign: 'center' }}>
          <div className="crest"><PieceIcon type="n" size={48} /></div>
          <h2 style={{ margin: '8px 0', fontFamily: 'Georgia, serif', color: 'var(--gold-2)' }}>3D is not available here</h2>
          <p className="hint">Chess 3D needs WebGL. Try updating your browser, turning on hardware acceleration, or opening the game in Chrome.</p>
          <button className="btn gold" style={{ marginTop: 12 }} onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="stage">
        {(
          <Boundary onFail={() => setSceneFailed(true)}>
            {materials && (
              <Scene
                {...sceneProps}
                tier={tier}
                materials={materials}
                events={game.events}
                resetToken={game.resetToken}
                handsOn={prefs.hands}
                showHands={playing && gameVisible && handsReal}
                onBusy={setBusy}
                onPlace={onPlace}
                onMateShown={() => setMateShown(true)}
                interactive={playing && gameVisible}
                autoQuality={prefs.graphics === 'auto'}
                onDecline={() => setAutoTierName((n) => (n === 'none' ? n : stepDown(n)))}
              />
            )}
          </Boundary>
        )}
        {!no3d && !materials && (
          <div className="loading">
            <div className="spinner" />
            <span>Polishing the board…</span>
          </div>
        )}
      </div>

      {playing && gameVisible && !puzzleMode && !reviewMode && (
        <div className="hud">
          <div className="hud-top">
            <PlayerBar {...barProps(top)} />
            {onlineMode && online.drawOffered && (
              <div className="banner">
                <span className="grow"><b>{nameOf(online.color === 'w' ? 'b' : 'w')}</b> offers a draw</span>
                <button className="btn small gold" onClick={() => online.answerDraw(true)}>Accept</button>
                <button className="btn small" onClick={() => online.answerDraw(false)}>Decline</button>
              </div>
            )}
            {onlineMode && online.oppAway && phase === 'playing' && (
              <div className="banner">
                <span className="grow">Opponent seems to have left.</span>
                <button className="btn small gold" onClick={online.claimWin}>Claim win</button>
              </div>
            )}
          </div>

          {statusText.t && <div className={`status ${statusText.k || ''}`}>{statusText.t}</div>}

          <div className="hud-bottom">
            <PlayerBar {...barProps(bottom)} />
            <div className="toolbar">
              <div className="tg tg-a">
                {onlineMode ? (
                  <button onClick={online.offerDraw} disabled={phase !== 'playing' || online.drawSent || game.moves.length < 2} title="Offer draw">
                    <Icon name="equals" />Draw{online.drawSent ? ' sent' : ''}
                  </button>
                ) : (
                  <button onClick={game.undo} disabled={phase !== 'playing' || !game.moves.length} title="Undo">
                    <Icon name="undo" />Undo
                  </button>
                )}
                {botMode && (
                  <button onClick={hint} disabled={phase !== 'playing' || game.thinking} title="Hint">
                    <Icon name="bulb" />Hint
                  </button>
                )}
                <button onClick={() => setManualFlip((f) => !f)} title="Flip board">
                  <Icon name="flip" />Flip
                </button>
              </div>
              <div className="tg tg-b">
                {onlineMode && chatOn && (
                  <button onClick={() => setChatOpen((o) => !o)} title="Chat" className="chatbtn">
                    <Icon name="chat" />Chat
                    {!chatOpen && msgs.length > seenCount && <i className="dot">{Math.min(9, msgs.length - seenCount)}</i>}
                  </button>
                )}
                <button onClick={() => setMovesOpen((o) => !o)} title="Move list">
                  <Icon name="moves" />Moves
                </button>
                <button onClick={onlineMode ? online.resign : game.resign} disabled={phase !== 'playing'} title="Resign">
                  <Icon name="flag" />Resign
                </button>
                <button onClick={() => setSheet('home')} title="Menu">
                  <Icon name="home" />Menu
                </button>
              </div>
            </div>
          </div>

          <MoveList moves={game.moves} open={movesOpen} onClose={() => setMovesOpen(false)} />
          {onlineMode && chatOn && (
            <>
              <ChatPanel
                open={chatOpen}
                onClose={() => setChatOpen(false)}
                messages={msgs}
                me={auth.profile?.uid}
                canWrite={!!online.color}
                onSend={online.sendChat}
                onReact={online.sendReaction}
              />
              {!chatOpen && <ChatPreview msg={chatPrev} onOpen={() => setChatOpen(true)} />}
              <ReactionFloat reaction={online.reaction} mine={online.color} />
            </>
          )}
        </div>
      )}

      {puzzleMode && pz && gameVisible && (
        <>
          {statusText.t && <div className={`status ${statusText.k || ''}`} style={{ top: `calc(16px + env(safe-area-inset-top, 0px))` }}>{statusText.t}</div>}
          <PuzzlePanel
            puzzle={pz.puzzle}
            index={PUZZLES.findIndex((p) => p.id === pz.puzzle.id)}
            status={pz.status}
            hintUsed={pz.hint}
            onHint={puzzleHint}
            onSolution={puzzleSolution}
            onNext={nextPuzzle}
            onRetry={() => startPuzzle(pz.puzzle)}
            onExit={() => setSheet('puzzles')}
          />
        </>
      )}

      {reviewMode && gameVisible && (
        <>
          <ReviewPanel analysis={review.analysis} progress={review.progress} ply={game.reviewPly} total={game.moves.length} onSeek={game.setReviewPly} onExit={exitReview} />
          <div className="hud" style={{ justifyContent: 'flex-start', pointerEvents: 'none' }}>
            <MoveList moves={game.moves} open={movesOpen} onClose={() => setMovesOpen(false)} current={game.reviewPly} onPick={game.setReviewPly} />
            <div className="toolbar review-tb" style={{ marginTop: 4 }}>
              <div className="tg tg-a">
                <button onClick={() => setManualFlip((f) => !f)}><Icon name="flip" />Flip</button>
              </div>
              <div className="tg tg-b">
                <button onClick={() => setMovesOpen((o) => !o)}><Icon name="moves" />Moves</button>
              </div>
            </div>
          </div>
        </>
      )}

      {game.pendingPromo && <PromotionDialog color={game.turn} onPick={game.choosePromotion} onCancel={game.cancelPromotion} />}
      {flash > 0 && <div key={flash} className="check-flash" />}
      {incoming && (
        <div className="challenge">
          <span className="grow"><b>{incoming.from.name}</b> challenges you ({incoming.tc?.label})</span>
          <button className="btn small gold" onClick={async () => { const c = incoming; setIncoming(null); await api.clearChallenge(auth.profile.uid); setSheet('online'); online.join(c.code) }}>Accept</button>
          <button className="btn small" onClick={() => { setIncoming(null); api.clearChallenge(auth.profile.uid) }}>Decline</button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}

      {showOver && (
        <GameOver
          result={game.result}
          settings={settings}
          settled={onlineMode ? online.settled : botMode ? botSettled : null}
          rematchLabel={onlineMode ? (online.rematchCode ? 'Accept rematch' : 'Rematch') : 'Rematch'}
          onRematch={rematch}
          onReview={reviewCurrent}
          onMenu={goHome}
          onDismiss={() => setOverDismissed(true)}
        />
      )}

      {sheet && (
        <div className="overlay menu">
          {sheet === 'home' && (
            <Home
              auth={auth}
              onNav={nav}
              resumeOnline={!!resumeOnline}
              onResumeOnline={() => online.open(online.resumeCode)}
              canResume={phase === 'playing' && !puzzleMode}
              onResume={() => setSheet(null)}
              daily={!pzProgress.solved.includes(dayPuzzle().id)}
              offline={!isOnline}
            />
          )}
          {(sheet === 'bot' || sheet === 'local') && <Setup botRating={botRating} mode={sheet} prefs={prefs} setPrefs={setPrefs} onStart={startLocal} onBack={() => setSheet('home')} engineError={game.engineError} />}
          {(sheet === 'online' || sheet === 'quick') && (
            <OnlineSheet auth={auth} online={online} prefs={prefs} setPrefs={setPrefs} quick={sheet === 'quick'} shareUrl={shareUrl} onBack={() => setSheet('home')} />
          )}
          {sheet === 'auth' && <AuthSheet auth={auth} reason={authReason} onBack={() => { pendingJoin.current = null; setSheet('home') }} onDone={() => setSheet(afterAuth)} />}
          {sheet === 'friends' && (
            <Friends
              auth={auth}
              timeControls={TIME_CONTROLS}
              onBack={() => setSheet('home')}
              onChallenge={async (f, tc) => {
                const c = await online.create(tc, 'r')
                if (c) {
                  await api.sendChallenge(auth.profile, f.uid, c, tc).then(() => api.notify({ type: 'challenge', to: f.uid })).catch(() => {})
                  setSheet('online')
                }
              }}
            />
          )}
          {sheet === 'import' && (
            <ImportSheet
              auth={auth}
              games={imported}
              onAdd={addImported}
              onClear={() => { setImported([]); saveImported([]) }}
              onReview={reviewRecord}
              onRated={(r) => {
                auth.refreshProfile?.()
                setBotRating({ rating: r.rating, games: 0 })
                write(BOT_KEY, { rating: r.rating, games: 0 })
                if (r.puzzleRating) setPzProgress((pr) => { const n = { ...pr, rating: r.puzzleRating }; write(PUZ_KEY, n); return n })
              }}
              onBack={() => setSheet('home')}
            />
          )}
          {sheet === 'leaderboard' && <Leaderboard auth={auth} onBack={() => setSheet('home')} />}
          {sheet === 'profile' && <Profile auth={auth} localHistory={localHistory} onReview={reviewRecord} onBack={() => setSheet('home')} />}
          {sheet === 'settings' && <Settings uid={auth.profile?.uid} prefs={prefs} setPrefs={setPrefs} autoTierName={autoTierName === 'none' ? '2D' : autoTierName} onBack={() => setSheet('home')} />}
          {sheet === 'shop' && (
            <Shop
              auth={auth}
              owned={owned}
              equipped={equipped}
              notice={shopNotice}
              onBack={(to) => {
                setShopNotice(null)
                if (to === 'auth') {
                  setAfterAuth('shop')
                  setAuthReason('Create an account to buy. Your purchases are saved to it.')
                  setSheet('auth')
                } else setSheet('home')
              }}
              onEquip={(it) => setPrefs({ ...prefs, [it.kind === 'board' ? 'board' : 'pieces']: it.id })}
              onPreview={(it) => {
                setPreview({ id: it.id, kind: it.kind })
                setSheet(null)
              }}
            />
          )}
          {sheet === 'puzzles' && <PuzzleSheet puzzles={PUZZLES} progress={pzProgress} daily={dayPuzzle()} onPlay={startPuzzle} onBack={() => setSheet('home')} />}
        </div>
      )}

      {preview && gameVisible && (
        <div className="peekbar">
          <div className="panel">
            <b>Previewing: {BY_ID[preview.id].name}</b>
            {owned.has(preview.id) ? (
              <button className="btn small gold" onClick={() => { setPrefs({ ...prefs, [preview.kind === 'board' ? 'board' : 'pieces']: preview.id }); setPreview(null); setSheet('shop') }}>Equip</button>
            ) : (
              <button className="btn small gold" onClick={() => { setPreview(null); setSheet('shop') }}>Buy</button>
            )}
            <button className="btn small" onClick={() => { setPreview(null); setSheet('shop') }}>Back to shop</button>
          </div>
        </div>
      )}

      {phase === 'over' && overDismissed && gameVisible && !puzzleMode && (
        <div className="over-chip">
          <button className="btn gold" onClick={rematch}>Rematch</button>
          <button className="btn" onClick={reviewCurrent}>Review</button>
          <button className="btn" onClick={goHome}>Home</button>
        </div>
      )}
    </div>
  )
}

export { TIERS }
