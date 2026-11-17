import { useEffect, useMemo, useState } from 'react'
import { LEVELS } from '../game/engine.js'
import { TIME_CONTROLS } from '../game/useChessGame.js'
import * as api from '../firebase/api.js'
import { CLASSES } from '../game/review.js'
import { Icon, PieceIcon, GoogleLogo } from './Icons.jsx'

const wx = (i) => ({ '--wx': `${(i * 83) % 240}px`, '--wy': `${(i * 47) % 160}px` })

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o, i) => (
        <button key={o.value} style={wx(i + 3)} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  )
}

const TimeSeg = ({ value, onChange }) => <Seg value={value} onChange={onChange} options={TIME_CONTROLS.map((t) => ({ value: t.id, label: t.label }))} />

function Head({ title, onBack }) {
  return (
    <div className="sheet-head">
      {onBack && (
        <button className="btn small" onClick={onBack} aria-label="Back">
          <Icon name="back" size={16} />
        </button>
      )}
      <h2>{title}</h2>
    </div>
  )
}

const initials = (n) => (n || '?').trim().slice(0, 1).toUpperCase()

/* ------------------------------------------------------------------ */
export function Home({ auth, onNav, resumeOnline, onResumeOnline, canResume, onResume, daily, offline }) {
  const p = auth.profile
  return (
    <div className="panel home">
      <div className="home-top">
        <button className="chip" onClick={() => onNav(p ? 'profile' : 'auth')}>
          <i>{p ? initials(p.name) : <Icon name="user" size={14} />}</i>
          {p ? (
            <>
              {p.name} <em>{p.rating}</em>
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </div>
      <div className="brand">
        <div className="crest"><PieceIcon type="n" size={54} /></div>
        <h1>CHESS 3D</h1>
        <p>Marble, walnut and ebony. A real board, in a real room.</p>
      </div>

      {offline && <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>You are offline. Computer games, puzzles and game review all still work.</div>}
      <div className="tiles">
        {resumeOnline && (
          <button className="tile wide accent" onClick={onResumeOnline}>
            <span className="ic"><Icon name="play" size={26} /></span>
            <span>
              <b>Resume online game</b>
              <br />
              <small>Your opponent is waiting</small>
            </span>
          </button>
        )}
        {canResume && !resumeOnline && (
          <button className="tile wide accent" onClick={onResume}>
            <span className="ic"><Icon name="play" size={26} /></span>
            <span>
              <b>Back to your game</b>
            </span>
          </button>
        )}
        <button className="tile accent" style={wx(1)} disabled={offline} onClick={() => onNav('online')}>
          <span className="ic"><Icon name="people" size={26} /></span>
          <b>Play a friend</b>
          <small>Room code or link</small>
        </button>
        <button className="tile accent" style={wx(2)} disabled={offline} onClick={() => onNav('quick')}>
          <span className="ic"><Icon name="bolt" size={26} /></span>
          <b>Quick match</b>
          <small>Find an opponent</small>
        </button>
        <button className="tile" style={wx(3)} onClick={() => onNav('bot')}>
          <span className="ic"><Icon name="cpu" size={26} /></span>
          <b>vs Computer</b>
          <small>Stockfish, 5 levels</small>
        </button>
        <button className="tile" style={wx(4)} onClick={() => onNav('local')}>
          <span className="ic"><PieceIcon type="p" size={26} /></span>
          <b>Pass & play</b>
          <small>Two players, one device</small>
        </button>
        <button className="tile" style={wx(5)} onClick={() => onNav('puzzles')}>
          <span className="ic"><Icon name="puzzle" size={26} /></span>
          <b>Puzzles</b>
          <small>{daily ? 'Daily puzzle ready' : 'Mate and tactics'}</small>
          {daily && <span className="tag">DAILY</span>}
        </button>
        <button className="tile" style={wx(8)} disabled={offline} onClick={() => onNav('friends')}>
          <span className="ic"><Icon name="people" size={26} /></span>
          <b>Friends</b>
          <small>Add and challenge</small>
        </button>
        <button className="tile" style={wx(9)} onClick={() => onNav('import')}>
          <span className="ic"><Icon name="download" size={26} /></span>
          <b>Import</b>
          <small>From Chess.com or Lichess</small>
        </button>
        <button className="tile" style={wx(6)} disabled={offline} onClick={() => onNav('leaderboard')}>
          <span className="ic"><Icon name="trophy" size={26} /></span>
          <b>Leaderboard</b>
          <small>Top rated players</small>
        </button>
        <button className="tile wide accent" style={wx(7)} disabled={offline} onClick={() => onNav('shop')}>
          <span className="ic"><Icon name="sparkle" size={26} /></span>
          <span>
            <b>Shop</b>
            <br />
            <small>Premium boards and piece sets</small>
          </span>
          <span className="tag">NEW</span>
        </button>
      </div>
      <div className="home-foot">
        <button className="btn small" onClick={() => onNav('profile')}>History</button>
        <button className="btn small" onClick={() => onNav('settings')}>Settings</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function Setup({ botRating, mode, prefs, setPrefs, onStart, onBack, engineError }) {
  const set = (k) => (v) => setPrefs({ ...prefs, [k]: v })
  return (
    <div className="panel sheet">
      <Head title={mode === 'bot' ? 'vs Computer' : 'Pass & play'} onBack={onBack} />
      {mode === 'bot' && (
        <>
          <label>Play as</label>
          <Seg value={prefs.color} onChange={set('color')} options={[{ value: 'w', label: 'White' }, { value: 'r', label: 'Random' }, { value: 'b', label: 'Black' }]} />
          <label>Difficulty{botRating ? ` · your offline rating ${botRating.rating}` : ''}</label>
          <Seg value={prefs.level} onChange={set('level')} options={LEVELS.map((l) => ({ value: l.id, label: l.name, sub: l.elo }))} />
        </>
      )}
      {mode === 'local' && (
        <>
          <label>Board</label>
          <Seg value={prefs.autoFlip ? 'flip' : 'fixed'} onChange={(v) => setPrefs({ ...prefs, autoFlip: v === 'flip' })} options={[{ value: 'flip', label: 'Turn to each player' }, { value: 'fixed', label: 'Fixed view' }]} />
        </>
      )}
      <label>Time</label>
      <TimeSeg value={prefs.time} onChange={set('time')} />
      {engineError && mode === 'bot' && <div className="warn">The chess engine could not load. The computer will play random moves.</div>}
      <div className="row gap" style={{ marginTop: 20 }}>
        <button className="btn gold big" onClick={() => onStart(mode)}>Start game</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function AuthSheet({ auth, onBack, onDone, reason }) {
  const [tab, setTab] = useState('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (tab === 'up') auth.signUp(email.trim(), pw, name.trim())
    else auth.signIn(email.trim(), pw)
  }
  useEffect(() => {
    if (auth.profile) onDone?.()
  }, [auth.profile]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="panel sheet">
      <Head title="Sign in" onBack={onBack} />
      <p className="hint">{reason || 'An account keeps your rating, game history and lets friends find you in a room.'}</p>
      <button className="btn big google" style={{ width: '100%' }} disabled={auth.busy} onClick={auth.google}>
        <GoogleLogo size={20} />
        <span>Continue with Google</span>
      </button>
      <div className="sep">OR EMAIL</div>
      <Seg value={tab} onChange={setTab} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
      <form onSubmit={submit}>
        {tab === 'up' && (
          <>
            <label>Display name</label>
            <input className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="How friends will see you" required />
          </>
        )}
        <label>Email</label>
        <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input className="field" type="password" autoComplete={tab === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required />
        <button className="btn gold big" style={{ width: '100%', marginTop: 16 }} disabled={auth.busy}>
          {tab === 'up' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {auth.error && <div className="warn">{auth.error}</div>}
      <div className="sep">OR</div>
      <button className="btn" style={{ width: '100%' }} disabled={auth.busy} onClick={auth.guest}>
        Play as guest
      </button>
      <p className="hint">Guests can play online but are not on the leaderboard.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function OnlineSheet({ auth, online, prefs, setPrefs, onBack, quick, shareUrl, onStartRoomGame }) {
  const [join, setJoin] = useState('')
  const [copied, setCopied] = useState(false)
  const set = (k) => (v) => setPrefs({ ...prefs, [k]: v })
  const tc = TIME_CONTROLS.find((t) => t.id === prefs.time) || TIME_CONTROLS[0]
  const p = auth.profile

  if (online.waiting && online.g) {
    const link = shareUrl(online.g.code)
    const text = `Come play chess with me! Room ${online.g.code}: ${link}`
    return (
      <div className="panel sheet">
        <Head title="Waiting for a friend" />
        <p className="hint">Share this code or link. The game starts the moment they join.</p>
        <div className="roomcode">{online.g.code}</div>
        <div className="hint" style={{ textAlign: 'center' }}>{online.g.tc.base == null ? 'No clock' : tc.label} · you play {online.color === 'w' ? 'White' : 'Black'}</div>
        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <a className="btn big gold" style={{ textAlign: 'center', textDecoration: 'none' }} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <button
            className="btn big"
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title: 'Chess 3D', text, url: link })
                else await navigator.clipboard.writeText(link)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                /* cancelled */
              }
            }}
          >
            {copied ? 'Copied' : 'Share link'}
          </button>
        </div>
        <button className="link" onClick={online.cancelRoom}>Cancel room</button>
      </div>
    )
  }

  if (online.queueing) {
    return (
      <div className="panel sheet" style={{ textAlign: 'center' }}>
        <Head title="Finding an opponent" />
        <div className="spinner" style={{ margin: '20px auto' }} />
        <p className="hint">Looking for a {tc.label} game near your rating ({p?.rating}). Keep this screen open.</p>
        <button className="btn" onClick={online.cancelQueue}>Cancel</button>
      </div>
    )
  }

  if (quick) {
    return (
      <div className="panel sheet">
        <Head title="Quick match" onBack={onBack} />
        <p className="hint">You will be paired with the closest-rated player waiting for the same time control. A clock is required.</p>
        <label>Time</label>
        <Seg value={prefs.time === 'inf' ? '5+0' : prefs.time} onChange={set('time')} options={TIME_CONTROLS.filter((t) => t.base).map((t) => ({ value: t.id, label: t.label }))} />
        {online.error && <div className="warn">{online.error}</div>}
        <button className="btn gold big" style={{ width: '100%', marginTop: 18 }} onClick={() => online.quickMatch(TIME_CONTROLS.find((t) => t.id === (prefs.time === 'inf' ? '5+0' : prefs.time)))}>
          Find opponent
        </button>
      </div>
    )
  }

  return (
    <div className="panel sheet">
      <Head title="Play a friend" onBack={onBack} />
      <label>Create a room</label>
      <Seg value={prefs.color} onChange={set('color')} options={[{ value: 'w', label: 'White' }, { value: 'r', label: 'Random' }, { value: 'b', label: 'Black' }]} />
      <div className="lbl">Time</div>
      <TimeSeg value={prefs.time} onChange={set('time')} />
      <button className="btn gold big" style={{ width: '100%', marginTop: 14 }} onClick={() => online.create(tc, prefs.color)}>
        Create room
      </button>
      <div className="sep">HAVE A CODE?</div>
      <div className="row gap">
        <input className="field code" value={join} maxLength={6} placeholder="CODE" onChange={(e) => setJoin(e.target.value.toUpperCase())} />
        <button className="btn" disabled={join.length < 6} onClick={() => online.join(join)}>
          Join
        </button>
      </div>
      {online.error && <div className="warn">{online.error}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function Leaderboard({ auth, onBack }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let dead = false
    api.getTopPlayers(50).then((r) => !dead && setRows(r)).catch((e) => !dead && setErr(e.message))
    return () => {
      dead = true
    }
  }, [])
  return (
    <div className="panel sheet">
      <Head title="Leaderboard" onBack={onBack} />
      {err && <div className="warn">Could not load the leaderboard. {err}</div>}
      {!rows && !err && <div className="empty">Loading…</div>}
      {rows && rows.length === 0 && <div className="empty">No ranked players yet. Play an online game to get on the board.</div>}
      <div className="list">
        {rows?.map((r, i) => (
          <div key={r.uid} className={`li ${auth.profile?.uid === r.uid ? 'me' : ''}`}>
            <span className="rk">{i + 1}</span>
            <span className="nm">
              {r.name}
              <br />
              <span className="sub">
                {r.wins || 0}W {r.losses || 0}L {r.draws || 0}D
              </span>
            </span>
            <span className="rt">{r.rating}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function Friends({ auth, onBack, onChallenge, timeControls }) {
  const me = auth.profile
  const [code, setCode] = useState(me?.friendCode || '')
  const [friends, setFriends] = useState(null)
  const [reqs, setReqs] = useState([])
  const [add, setAdd] = useState('')
  const [msg, setMsg] = useState('')
  const [tc, setTc] = useState('5+0')
  const [copied, setCopied] = useState(false)
  const reload = async () => {
    try {
      const [f, r] = await Promise.all([api.getFriends(me.uid), api.getRequests(me.uid)])
      setFriends(f)
      setReqs(r)
    } catch (e) {
      setMsg(e.message)
      setFriends([])
    }
  }
  useEffect(() => {
    if (!me) return
    api.ensureFriendCode(me).then(setCode).catch(() => {})
    reload()
  }, [me?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
  const sendReq = async () => {
    setMsg('')
    try {
      const t = await api.findByCode(add)
      if (!t) return setMsg('No player has that code.')
      await api.sendFriendRequest(me, t)
      api.notify({ type: 'friend', to: t.uid })
      setMsg(`Request sent to ${t.name}.`)
      setAdd('')
    } catch (e) {
      setMsg(e.message)
    }
  }
  const answer = async (r, ok) => {
    await api.answerRequest(me, r, ok).catch((e) => setMsg(e.message))
    reload()
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="panel sheet">
      <Head title="Friends" onBack={onBack} />
      <label>Your friend code</label>
      <div className="li">
        <span className="nm" style={{ letterSpacing: '0.2em', fontWeight: 800 }}>{code || '…'}</span>
        <button className="btn small" onClick={copy} disabled={!code}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <label>Add a friend</label>
      <div className="row">
        <input value={add} maxLength={6} onChange={(e) => setAdd(e.target.value.toUpperCase())} placeholder="Friend code" style={{ flex: 1 }} />
        <button className="btn" disabled={add.length < 6} onClick={sendReq}>Send request</button>
      </div>
      {msg && <div className="note">{msg}</div>}
      {reqs.length > 0 && (
        <>
          <label>Requests</label>
          <div className="list">
            {reqs.map((r) => (
              <div key={r.id} className="li">
                <span className="nm">{r.from.name}<br /><span className="sub">{r.from.rating}</span></span>
                <button className="btn small gold" onClick={() => answer(r, true)}>Accept</button>
                <button className="btn small" onClick={() => answer(r, false)}>Decline</button>
              </div>
            ))}
          </div>
        </>
      )}
      <label>Challenge with</label>
      <Seg value={tc} onChange={setTc} options={timeControls.filter((t) => t.id !== 'inf').map((t) => ({ value: t.id, label: t.label }))} />
      <label>Your friends</label>
      {!friends && <div className="empty">Loading…</div>}
      {friends && friends.length === 0 && <div className="empty">No friends yet. Share your code.</div>}
      <div className="list">
        {friends?.map((f) => (
          <div key={f.uid} className="li">
            <span className="nm">{f.name}<br /><span className="sub">{f.rating ?? ''}</span></span>
            <button className="btn small gold" onClick={() => onChallenge(f, timeControls.find((t) => t.id === tc))}>Challenge</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function Profile({ auth, onBack, onReview, localHistory }) {
  const p = auth.profile
  const [rows, setRows] = useState(null)
  const [name, setName] = useState(p?.name || '')
  useEffect(() => {
    if (!p) return
    let dead = false
    api.getHistory(p.uid, 30).then((r) => !dead && setRows(r)).catch(() => !dead && setRows([]))
    return () => {
      dead = true
    }
  }, [p?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!p)
    return (
      <div className="panel sheet">
        <Head title="History" onBack={onBack} />
        <p className="hint">Sign in to keep your rating and game history across devices.</p>
        {localHistory?.length > 0 && <div className="lbl">Games on this device</div>}
        <div className="list">
          {localHistory?.map((h, i) => (
            <button key={i} className="li" style={{ cursor: 'pointer', color: 'inherit', textAlign: 'left' }} onClick={() => onReview(h)}>
              <span className={`res ${h.result}`}>{h.result[0].toUpperCase()}</span>
              <span className="nm">{h.opp}</span>
              <span className="sub">{h.moves.length} plies</span>
            </button>
          ))}
        </div>
      </div>
    )
  return (
    <div className="panel sheet">
      <Head title="Profile" onBack={onBack} />
      <div className="row gap">
        <input className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim() || name === p.name} onClick={() => auth.rename(name.trim())}>
          Save
        </button>
      </div>
      <div className="statrow">
        <div className="stat"><b>{p.rating}</b><small>Elo</small></div>
        <div className="stat"><b>{p.wins || 0}</b><small>Wins</small></div>
        <div className="stat"><b>{p.losses || 0}</b><small>Losses</small></div>
        <div className="stat"><b>{p.draws || 0}</b><small>Draws</small></div>
      </div>
      <div className="lbl">Recent games</div>
      {!rows && <div className="empty">Loading…</div>}
      {rows && rows.length === 0 && <div className="empty">No games yet.</div>}
      <div className="list">
        {rows?.map((h) => (
          <button key={h.id} className="li" style={{ cursor: 'pointer', color: 'inherit', textAlign: 'left' }} onClick={() => onReview(h)}>
            <span className={`res ${h.result}`}>{h.result[0].toUpperCase()}</span>
            <span className="nm">
              {h.mode === 'bot' ? `Stockfish ${LEVELS.find((l) => l.id === h.level)?.name || ''}` : h.opp}
              <br />
              <span className="sub">{h.mode === 'bot' ? 'vs Computer' : 'Online'} · {h.reason}</span>
            </span>
            {h.mode === 'online' && h.rated && <span className={`rt delta ${h.delta >= 0 ? 'pos' : 'neg'}`}>{h.delta >= 0 ? '+' : ''}{h.delta}</span>}
          </button>
        ))}
      </div>
      <button className="link" onClick={auth.signOut}>Sign out</button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function Settings({ uid, prefs, setPrefs, autoTierName, onBack }) {
  const [pushMsg, setPushMsg] = useState('')
  const vapid = import.meta.env.VITE_VAPID_KEY
  const pushOn = prefs.push !== false && api.pushSupported() && typeof Notification !== 'undefined' && Notification.permission === 'granted'
  const setPush = async (v) => {
    setPushMsg('')
    if (v === 'on') {
      try {
        if (!uid) throw new Error('Sign in first.')
        await api.registerPush(uid, vapid)
        setPrefs({ ...prefs, push: true })
        setPushMsg('Notifications are on.')
      } catch (e) {
        setPushMsg(e.message)
      }
    } else {
      await api.unregisterPush(uid).catch(() => {})
      setPrefs({ ...prefs, push: false })
    }
  }
  return (
    <div className="panel sheet">
      <Head title="Settings" onBack={onBack} />
      <label>Graphics</label>
      <Seg
        value={prefs.graphics}
        onChange={(v) => setPrefs({ ...prefs, graphics: v })}
        options={[{ value: 'auto', label: 'Auto', sub: autoTierName }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Lite', sub: 'Fastest' }]}
      />
      <label>Hands move the pieces</label>
      <Seg value={prefs.hands ? 'on' : 'off'} onChange={(v) => setPrefs({ ...prefs, hands: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      <label>Chat and reactions (online games)</label>
      <Seg value={prefs.chat === false ? 'off' : 'on'} onChange={(v) => setPrefs({ ...prefs, chat: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      <label>Notifications (your move, challenges, friend requests)</label>
      {!api.pushSupported() || !vapid ? (
        <div className="note" style={{ marginTop: 0 }}>{!api.pushSupported() ? 'Not supported on this browser. On iPhone, add the app to the Home Screen first.' : 'Notifications are not set up yet.'}</div>
      ) : (
        <Seg value={pushOn ? 'on' : 'off'} onChange={setPush} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      )}
      {pushMsg && <div className="note">{pushMsg}</div>}
      <label>Sound</label>
      <Seg value={prefs.sound ? 'on' : 'off'} onChange={(v) => setPrefs({ ...prefs, sound: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      <p className="hint">Lite is still 3D, tuned for older phones: it skips shadows and fine detail, and runs at 30 fps to save battery. Auto lowers quality by itself if the game stutters.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
export function PuzzleSheet({ puzzles, progress, daily, onPlay, onBack }) {
  const next = useMemo(() => {
    const open = puzzles.filter((p) => !progress.solved.includes(p.id))
    return open.sort((a, b) => Math.abs(a.rating - progress.rating) - Math.abs(b.rating - progress.rating))[0] || puzzles[0]
  }, [puzzles, progress])
  return (
    <div className="panel sheet">
      <Head title="Puzzles" onBack={onBack} />
      <div className="statrow" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat"><b>{progress.rating}</b><small>Puzzle rating</small></div>
        <div className="stat"><b>{progress.solved.length}</b><small>Solved</small></div>
        <div className="stat"><b>{progress.streak}</b><small>Streak</small></div>
      </div>
      <div className="row gap">
        <button className="btn gold big" onClick={() => onPlay(next)}>Next puzzle</button>
        <button className="btn big" onClick={() => onPlay(daily)}>Daily puzzle</button>
      </div>
      <div className="lbl">All puzzles</div>
      <div className="seg" style={{ gap: 6 }}>
        {puzzles.map((p, i) => (
          <button key={p.id} style={{ flex: '0 0 calc(12.5% - 6px)', minWidth: 0, padding: '8px 0', ...wx(i) }} className={progress.solved.includes(p.id) ? 'on' : ''} onClick={() => onPlay(p)} title={`${p.theme} · ${p.rating}`}>
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

export { CLASSES }
