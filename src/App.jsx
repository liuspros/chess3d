import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Scene from './three/Scene.jsx'
import { TIERS, buildMaterials } from './three/materials.js'
import Board2D from './ui/Board2D.jsx'
import { GameOver, MoveList, PlayerBar, PromotionDialog } from './ui/Hud.jsx'
import { AuthSheet, Home, Leaderboard, OnlineSheet, Profile, PuzzleSheet, Settings, Setup } from './ui/Screens.jsx'
import { PuzzlePanel, ReviewPanel } from './ui/Panels.jsx'
import { applyWoodTheme } from './ui/wood.js'
import { LEVELS } from './game/engine.js'
import { TIME_CONTROLS, useChessGame } from './game/useChessGame.js'
import { analyzeGame } from './game/review.js'
import { useAuth } from './online/useAuth.js'
import { useOnline } from './online/useOnline.js'
import { saveBotGame } from './firebase/api.js'
import PUZZLES from './data/puzzles.json'
import { detectTier, resolveTier, stepDown } from './lib/quality.js'
import { play, setMuted } from './lib/sound.js'

export const APP_NAME = 'Chess 3D'

const PREF_KEY = 'chess3d.prefs.v1'
const PUZ_KEY = 'chess3d.puzzles.v1'
const HIST_KEY = 'chess3d.history.v1'
const DEFAULT_PREFS = { color: 'w', level: 'casual', time: 'inf', graphics: 'auto', sound: true, autoFlip: true, hands: true }
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

// Builds (and rebuilds on tier change) all textures/materials.
function useMaterials(tier, enabled) {
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let dispose = null
    let cancelled = false
    setState(null)
    buildMaterials(tier)
      .then((built) => {
        if (cancelled) {
          built.dispose()
          return
        }
        dispose = built.dispose
        setState(built.materials)
      })
      .catch((e) => console.error('materials failed', e))
    return () => {
      cancelled = true
      if (dispose) dispose()
    }
  }, [tier, enabled])
  return state
}

const dayPuzzle = () => PUZZLES[Math.floor(Date.now() / 864e5) % PUZZLES.length]

export default function App() {
  const game = useChessGame()
  const auth = useAuth()
  const online = useOnline({ game, profile: auth.profile, refreshProfile: auth.refreshProfile })

  const [prefs, setPrefsState] = useState(() => read(PREF_KEY, DEFAULT_PREFS))
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
  const [pz, setPz] = useState(null)
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

  const no3d = autoTierName === 'none' || prefs.graphics === '2d' || sceneFailed
  const tier = useMemo(() => resolveTier(prefs.graphics === '2d' ? 'low' : prefs.graphics, autoTierName === 'none' ? 'low' : autoTierName), [prefs.graphics, autoTierName])
  const materials = useMaterials(tier, !no3d)

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
  }

  /* ------------------------------ navigation ------------------------------ */
  const nav = (t) => {
    if (['online', 'quick', 'leaderboard'].includes(t) && !auth.profile) {
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
    setSheet(null)
    game.startGame({ mode, playerColor: mode === 'bot' ? color : 'w', level: prefs.level, time })
  }

  const rematch = () => {
    if (onlineMode) return online.rematch()
    if (!settings) return
    resetUi()
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
    const list = [rec, ...localHistory].slice(0, 20)
    setLocalHistory(list)
    write(HIST_KEY, list)
    if (settings.mode === 'bot' && auth.profile) saveBotGame(auth.profile.uid, rec).catch(() => {})
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

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
    startPuzzle(rest.find((p) => !pzProgress.solved.includes(p.id)) || rest[0] || pz.puzzle)
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

  return (
    <div className="app">
      <div className="stage">
        {no3d ? (
          <Board2D {...sceneProps} />
        ) : (
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
              {onlineMode ? (
                <button onClick={online.offerDraw} disabled={phase !== 'playing' || online.drawSent || game.moves.length < 2} title="Offer draw">
                  <span>½</span>{online.drawSent ? 'Sent' : 'Draw'}
                </button>
              ) : (
                <button onClick={game.undo} disabled={phase !== 'playing' || !game.moves.length} title="Undo">
                  <span>↶</span>Undo
                </button>
              )}
              <button onClick={() => setManualFlip((f) => !f)} title="Flip board">
                <span>⟲</span>Flip
              </button>
              <button onClick={() => setMovesOpen((o) => !o)} title="Move list">
                <span>☰</span>Moves
              </button>
              <button onClick={onlineMode ? online.resign : game.resign} disabled={phase !== 'playing'} title="Resign">
                <span>⚑</span>Resign
              </button>
              <button onClick={() => setSheet('home')} title="Menu">
                <span>⚙</span>Menu
              </button>
            </div>
          </div>

          <MoveList moves={game.moves} open={movesOpen} onClose={() => setMovesOpen(false)} />
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
            <div className="toolbar" style={{ marginTop: 4 }}>
              <button onClick={() => setManualFlip((f) => !f)}><span>⟲</span>Flip</button>
              <button onClick={() => setMovesOpen((o) => !o)}><span>☰</span>Moves</button>
            </div>
          </div>
        </>
      )}

      {game.pendingPromo && <PromotionDialog color={game.turn} onPick={game.choosePromotion} onCancel={game.cancelPromotion} />}
      {flash > 0 && <div key={flash} className="check-flash" />}
      {toast && <div className="toast">{toast}</div>}

      {showOver && (
        <GameOver
          result={game.result}
          settings={settings}
          settled={online.settled}
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
            />
          )}
          {(sheet === 'bot' || sheet === 'local') && <Setup mode={sheet} prefs={prefs} setPrefs={setPrefs} onStart={startLocal} onBack={() => setSheet('home')} engineError={game.engineError} />}
          {(sheet === 'online' || sheet === 'quick') && (
            <OnlineSheet auth={auth} online={online} prefs={prefs} setPrefs={setPrefs} quick={sheet === 'quick'} shareUrl={shareUrl} onBack={() => setSheet('home')} />
          )}
          {sheet === 'auth' && <AuthSheet auth={auth} reason={authReason} onBack={() => { pendingJoin.current = null; setSheet('home') }} onDone={() => setSheet(afterAuth)} />}
          {sheet === 'leaderboard' && <Leaderboard auth={auth} onBack={() => setSheet('home')} />}
          {sheet === 'profile' && <Profile auth={auth} localHistory={localHistory} onReview={reviewRecord} onBack={() => setSheet('home')} />}
          {sheet === 'settings' && <Settings prefs={prefs} setPrefs={setPrefs} autoTierName={autoTierName === 'none' ? '2D' : autoTierName} onBack={() => setSheet('home')} />}
          {sheet === 'puzzles' && <PuzzleSheet puzzles={PUZZLES} progress={pzProgress} daily={dayPuzzle()} onPlay={startPuzzle} onBack={() => setSheet('home')} />}
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
