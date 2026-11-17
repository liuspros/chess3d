import { useEffect, useRef, useState } from 'react'
import * as api from '../firebase/api.js'
import { Icon } from './Icons.jsx'
import { Seg } from './Screens.jsx'
import { clearPendingLichess, pendingLichess, startLichessLogin } from '../lib/lichessOAuth.js'
import { importChesscom, importLichess, parsePgnText } from '../lib/importers.js'

const SITE = { lichess: 'Lichess', chesscom: 'Chess.com' }
const PLATFORMS = [
  { value: 'lichess', label: 'Lichess' },
  { value: 'chesscom', label: 'Chess.com' },
]

function RatingTab({ auth, onRated }) {
  const p = auth.profile
  const [platform, setPlatform] = useState('lichess')
  const [username, setUsername] = useState('')
  const [step, setStep] = useState(null) // { code, where }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(null)

  // returning from Lichess: finish the import with the code Lichess gave us
  const uid = p?.uid
  const ok = !!p && !p.guest && !p.imported
  useEffect(() => {
    const pend = pendingLichess()
    if (!pend || !ok) return
    clearPendingLichess()
    setPlatform('lichess')
    setBusy(true)
    api.importRequest({ action: 'lichess_oauth', ...pend })
      .then((r) => { setDone(r); onRated(r) })
      .catch((e) => setMsg(e.message))
      .finally(() => setBusy(false))
  }, [uid, ok]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!p || p.guest) return <p className="hint">Sign in with Google or email to bring your rating over. Guests can still import games below.</p>
  if (p.imported && !done)
    return (
      <div className="stack">
        <div className="statrow" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="stat"><b>{p.rating}</b><small>Your Elo here</small></div>
          <div className="stat"><b>{p.imported.raw}</b><small>{SITE[p.imported.platform]} {p.imported.kind}</small></div>
          <div className="stat"><b>{p.provisional > 0 ? p.provisional : 0}</b><small>Provisional games left</small></div>
        </div>
        <p className="hint">Imported from {SITE[p.imported.platform]} ({p.imported.username}). A rating can only be imported once.</p>
      </div>
    )
  if (done)
    return (
      <div className="stack">
        <div className="statrow" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="stat"><b>{done.rating}</b><small>Your Elo here</small></div>
          <div className="stat"><b>{done.raw}</b><small>{SITE[platform]} {done.kind}</small></div>
          <div className="stat"><b>{done.puzzleRating || '-'}</b><small>Puzzle level</small></div>
        </div>
        <p className="hint">
          Your first {done.provisional} rated games count extra, so the number settles on your real strength quickly.
          {platform === 'lichess' && ' Lichess ratings run higher than Chess.com for most players, so yours was adjusted down.'}
        </p>
      </div>
    )

  const start = async () => {
    setBusy(true)
    setMsg('')
    try {
      setStep(await api.importRequest({ action: 'start', platform, username }))
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }
  const verify = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await api.importRequest({ action: 'verify' })
      setDone(r)
      onRated(r)
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="stack">
      <p className="hint">Prove the account is yours, and we start your rating where you left off.</p>
      <Seg value={platform} options={PLATFORMS} onChange={(v) => { setPlatform(v); setStep(null) }} />
      {platform === 'lichess' && !step && (
        <>
          <button className="btn gold big" disabled={busy} onClick={() => startLichessLogin()}>{busy ? 'Checking…' : 'Continue with Lichess'}</button>
          <p className="hint" style={{ textAlign: 'center' }}>One tap. Lichess only tells us your username, nothing else. Or use a code:</p>
        </>
      )}
      {!step ? (
        <>
          <input className="field" placeholder={`${SITE[platform]} username`} value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(e.target.value.trim())} />
          <button className="btn gold big" disabled={busy || username.length < 2} onClick={start}>Get my code</button>
        </>
      ) : (
        <>
          <div className="code-box">{step.code}</div>
          <p className="hint">
            {platform === 'lichess'
              ? 'On Lichess open Preferences > Profile and paste the code anywhere in your bio. Save.'
              : 'On Chess.com open Settings > Profile and paste the code into the Location field (scroll down). If you do not see Location, add the code after your name instead, for example "Julius MIGRATE-1234". Save.'}{' '}
            Then press Verify. You can remove it afterwards.
          </p>
          <div className="row gap">
            <button className="btn gold big" disabled={busy} onClick={verify}>{busy ? 'Checking…' : 'Verify and import'}</button>
            <button className="btn big" disabled={busy} onClick={() => setStep(null)}>Change</button>
          </div>
        </>
      )}
      {msg && <div className="hint" role="alert">{msg}</div>}
    </div>
  )
}

function GamesTab({ games, onAdd, onClear, onReview, defaultUser, defaultPlatform }) {
  const [platform, setPlatform] = useState(defaultPlatform || 'lichess')
  const [username, setUsername] = useState(defaultUser || '')
  const [max, setMax] = useState(100)
  const [state, setState] = useState(null) // { text }
  const [msg, setMsg] = useState('')
  const [over, setOver] = useState(false)
  const ac = useRef(null)
  useEffect(() => () => ac.current?.abort(), [])

  const run = async () => {
    ac.current?.abort()
    const c = new AbortController()
    ac.current = c
    setMsg('')
    const opts = {
      max,
      signal: c.signal,
      onWait: (s) => setState({ text: `${SITE[platform]} asked us to slow down. Resuming in ${s}s…` }),
      onProgress: (p) => setState({ text: p.phase === 'parse' ? `Reading games ${p.done}/${p.total}…` : p.months ? `Downloading month ${p.month}/${p.months} (${p.done} games)…` : 'Downloading…' }),
    }
    try {
      setState({ text: 'Starting…' })
      let n = 0
      if (platform === 'lichess') {
        const list = await importLichess(username, opts)
        n = list.length
        onAdd(list)
      } else {
        const list = await importChesscom(username, { ...opts, onBatch: (b) => onAdd(b) })
        n = list.length
      }
      setMsg(n ? `Imported ${n} games.` : 'No games found.')
    } catch (e) {
      if (e.name !== 'AbortError') setMsg(e.message)
    }
    setState(null)
  }
  const readFiles = async (files) => {
    setMsg('')
    let total = 0
    try {
      for (const f of files) {
        setState({ text: `Reading ${f.name}…` })
        const list = await parsePgnText(await f.text(), username, 'pgn')
        total += list.length
        onAdd(list)
      }
      setMsg(total ? `Added ${total} games from file.` : 'No readable games in that file.')
    } catch {
      setMsg('Could not read that file.')
    }
    setState(null)
  }

  return (
    <div className="stack">
      <Seg value={platform} options={PLATFORMS} onChange={setPlatform} />
      <input className="field" placeholder={`${SITE[platform]} username`} value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(e.target.value.trim())} />
      <Seg value={max} options={[{ value: 50, label: '50' }, { value: 100, label: '100' }, { value: 200, label: '200' }]} onChange={setMax} />
      <div className="row gap">
        <button className="btn gold big" disabled={!!state || username.length < 2} onClick={run}>{state ? 'Working…' : 'Import recent games'}</button>
        {state && <button className="btn big" onClick={() => ac.current?.abort()}>Stop</button>}
      </div>
      <label
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); readFiles([...e.dataTransfer.files]) }}
      >
        <Icon name="download" size={22} />
        <span>Drop a .pgn file here, or tap to choose</span>
        <input type="file" accept=".pgn,text/plain" multiple hidden onChange={(e) => { readFiles([...e.target.files]); e.target.value = '' }} />
      </label>
      {state && <div className="hint" aria-live="polite">{state.text}</div>}
      {msg && <div className="hint" role="status">{msg}</div>}
      {games.length > 0 && (
        <>
          <div className="lbl">Imported games ({games.length})</div>
          <div className="list" style={{ maxHeight: 260, overflow: 'auto' }}>
            {games.slice(0, 60).map((g) => (
              <button key={g.id} className="li" style={{ cursor: 'pointer', color: 'inherit', textAlign: 'left' }} onClick={() => onReview(g)}>
                <span className={`res ${g.result}`}>{g.result[0].toUpperCase()}</span>
                <span className="nm">
                  {g.opp}
                  <br />
                  <span className="sub">{g.src === 'pgn' ? 'PGN' : SITE[g.src]} · {g.moves.length} plies{g.oppRating ? ` · ${g.oppRating}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="link" onClick={onClear}>Remove imported games from this device</button>
        </>
      )}
    </div>
  )
}

export function ImportSheet({ auth, games, onAdd, onClear, onReview, onRated, onBack }) {
  const [tab, setTab] = useState('rating')
  const imp = auth.profile?.imported
  return (
    <div className="panel sheet">
      <div className="sheet-head">
        <button className="btn small" onClick={onBack} aria-label="Back"><Icon name="back" size={16} /></button>
        <h2>Bring your chess over</h2>
      </div>
      <Seg value={tab} options={[{ value: 'rating', label: 'Rating' }, { value: 'games', label: 'Games' }]} onChange={setTab} />
      {tab === 'rating' ? <RatingTab auth={auth} onRated={onRated} /> : <GamesTab games={games} onAdd={onAdd} onClear={onClear} onReview={onReview} defaultUser={imp?.username} defaultPlatform={imp?.platform} />}
    </div>
  )
}
