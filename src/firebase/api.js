// All Firebase access lives here (auth, profiles, online games, queue, leaderboard).
// The SDK is loaded lazily so the offline / bot experience never pays for it.
import { firebaseConfig } from './config.js'
import { eloDelta } from '../lib/elo.js'

let M = null
let loading = null
let offset = 0 // serverTime - clientTime (ms)

export async function load() {
  if (M) return M
  if (!loading) {
    loading = (async () => {
      const [app, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
      const a = app.initializeApp(firebaseConfig)
      M = { a, auth: auth.getAuth(a), db: fs.getFirestore(a), au: auth, fs }
      return M
    })()
  }
  return loading
}

export const serverNow = () => Date.now() + offset

const ms = (t) => (t == null ? null : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : null)

/* ------------------------------- auth ------------------------------- */
export async function onAuth(cb) {
  const m = await load()
  return m.au.onAuthStateChanged(m.auth, cb)
}
export async function signInGoogle() {
  const m = await load()
  return m.au.signInWithPopup(m.auth, new m.au.GoogleAuthProvider())
}
export async function signUpEmail(email, password, name) {
  const m = await load()
  const cred = await m.au.createUserWithEmailAndPassword(m.auth, email, password)
  if (name) await m.au.updateProfile(cred.user, { displayName: name })
  return cred
}
export async function signInEmail(email, password) {
  const m = await load()
  return m.au.signInWithEmailAndPassword(m.auth, email, password)
}
export async function signInGuest() {
  const m = await load()
  return m.au.signInAnonymously(m.auth)
}
export async function signOutUser() {
  const m = await load()
  return m.au.signOut(m.auth)
}
export async function resetPassword(email) {
  const m = await load()
  return m.au.sendPasswordResetEmail(m.auth, email)
}

/* ------------------------------ profile ------------------------------ */
const norm = (d) => (d ? { ...d } : null)

export async function ensureProfile(user, wantedName) {
  const { db, fs } = await load()
  const ref = fs.doc(db, 'users', user.uid)
  const snap = await fs.getDoc(ref)
  if (snap.exists()) {
    const p = snap.data()
    if (wantedName && wantedName !== p.name) await fs.updateDoc(ref, { name: wantedName })
    return { uid: user.uid, ...p, ...(wantedName ? { name: wantedName } : {}) }
  }
  const name = wantedName || user.displayName || (user.isAnonymous ? 'Guest ' + Math.floor(1000 + Math.random() * 9000) : (user.email || 'Player').split('@')[0])
  const p = { name: name.slice(0, 24), rating: 1200, games: 0, wins: 0, losses: 0, draws: 0, guest: !!user.isAnonymous, createdAt: fs.serverTimestamp(), activeGame: null }
  await fs.setDoc(ref, p)
  return { uid: user.uid, ...p, createdAt: null }
}

export async function getProfile(uid) {
  const { db, fs } = await load()
  const s = await fs.getDoc(fs.doc(db, 'users', uid))
  return s.exists() ? { uid, ...s.data() } : null
}

export async function renameUser(uid, name) {
  const { db, fs } = await load()
  await fs.updateDoc(fs.doc(db, 'users', uid), { name: name.slice(0, 24) })
}

// calibrates the server clock offset by writing a server timestamp and reading it back
export async function calibrate(uid) {
  const { db, fs } = await load()
  const ref = fs.doc(db, 'users', uid)
  const t0 = Date.now()
  await fs.updateDoc(ref, { lastSeen: fs.serverTimestamp() })
  const s = await fs.getDoc(ref)
  const t1 = Date.now()
  const server = ms(s.data({ serverTimestamps: 'estimate' }).lastSeen)
  if (server) offset = server - (t0 + t1) / 2
  return offset
}

export async function setActiveGame(uid, code) {
  const { db, fs } = await load()
  try {
    await fs.updateDoc(fs.doc(db, 'users', uid), { activeGame: code || null })
  } catch {
    /* ignore */
  }
}

export async function getTopPlayers(n = 50) {
  const { db, fs } = await load()
  const q = fs.query(fs.collection(db, 'users'), fs.orderBy('rating', 'desc'), fs.limit(n * 2))
  const s = await fs.getDocs(q)
  return s.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((p) => !p.guest && (p.games || 0) > 0)
    .slice(0, n)
}

export async function getHistory(uid, n = 30) {
  const { db, fs } = await load()
  const q = fs.query(fs.collection(db, 'users', uid, 'history'), fs.orderBy('at', 'desc'), fs.limit(n))
  const s = await fs.getDocs(q)
  return s.docs.map((d) => {
    const x = d.data({ serverTimestamps: 'estimate' })
    return { id: d.id, ...x, at: ms(x.at) }
  })
}

export async function saveBotGame(uid, rec) {
  const { db, fs } = await load()
  await fs.addDoc(fs.collection(db, 'users', uid, 'history'), { ...rec, at: fs.serverTimestamp() })
}

/* ------------------------------ games ------------------------------ */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const genCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('')
const slot = (p) => ({ uid: p.uid, name: p.name, rating: p.rating ?? 1200 })

function readGame(snap) {
  if (!snap.exists()) return null
  const d = snap.data({ serverTimestamps: 'estimate' })
  return {
    ...d,
    lastMoveAt: ms(d.lastMoveAt),
    seenW: ms(d.seenW),
    seenB: ms(d.seenB),
    createdAt: ms(d.createdAt),
    endedAt: ms(d.endedAt),
    moves: d.moves || [],
  }
}

function newGameDoc(code, tc, creator, color, extra = {}) {
  const white = color === 'w' ? slot(creator) : null
  const black = color === 'b' ? slot(creator) : null
  return {
    code,
    status: 'waiting',
    tc: { id: tc.id, base: tc.base ?? null, inc: tc.inc ?? 0 },
    creator: creator.uid,
    white,
    black,
    players: [creator.uid],
    moves: [],
    clockW: tc.base ?? null,
    clockB: tc.base ?? null,
    lastMoveAt: null,
    result: null,
    drawOffer: null,
    rematch: null,
    eloApplied: {},
    ...extra,
  }
}

export async function createGame(profile, { tc, color = 'r' }) {
  const { db, fs } = await load()
  const c = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color
  for (let i = 0; i < 5; i++) {
    const code = genCode()
    const ref = fs.doc(db, 'games', code)
    if ((await fs.getDoc(ref)).exists()) continue
    await fs.setDoc(ref, { ...newGameDoc(code, tc, profile, c), createdAt: fs.serverTimestamp(), seenW: null, seenB: null })
    await setActiveGame(profile.uid, code)
    return code
  }
  throw new Error('Could not create a room, try again')
}

export async function joinGame(profile, rawCode) {
  const { db, fs } = await load()
  const code = rawCode.trim().toUpperCase()
  const ref = fs.doc(db, 'games', code)
  const out = await fs.runTransaction(db, async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists()) throw new Error('Room not found. Check the code.')
    const g = s.data()
    if ((g.players || []).includes(profile.uid)) return g
    if (g.status !== 'waiting') throw new Error('That room is already full.')
    const freeColor = g.white ? 'b' : 'w'
    tx.update(ref, {
      [freeColor === 'w' ? 'white' : 'black']: slot(profile),
      players: [...g.players, profile.uid],
      status: 'active',
      lastMoveAt: fs.serverTimestamp(),
    })
    return g
  })
  await setActiveGame(profile.uid, code)
  return code
}

export async function subscribeGame(code, cb, onErr) {
  const { db, fs } = await load()
  return fs.onSnapshot(
    fs.doc(db, 'games', code),
    (s) => cb(readGame(s)),
    (e) => onErr?.(e),
  )
}

export async function cancelRoom(code) {
  const { db, fs } = await load()
  try {
    await fs.deleteDoc(fs.doc(db, 'games', code))
  } catch {
    /* ignore */
  }
}

function remainingFor(g, color, now) {
  const base = color === 'w' ? g.clockW : g.clockB
  if (base == null) return null
  const turn = g.moves.length % 2 === 0 ? 'w' : 'b'
  if (g.status !== 'active' || turn !== color || !g.lastMoveAt) return base
  return Math.max(0, base - (now - g.lastMoveAt))
}
export { remainingFor }

export async function submitMove(code, uid, uci, expectedCount, over) {
  const { db, fs } = await load()
  const ref = fs.doc(db, 'games', code)
  return fs.runTransaction(db, async (tx) => {
    const s = await tx.get(ref)
    const raw = s.data()
    if (!raw) throw new Error('gone')
    const g = { ...raw, lastMoveAt: ms(raw.lastMoveAt), moves: raw.moves || [] }
    if (g.status !== 'active') throw new Error('stale')
    if (g.moves.length !== expectedCount) throw new Error('stale')
    const color = g.moves.length % 2 === 0 ? 'w' : 'b'
    if ((color === 'w' ? g.white : g.black)?.uid !== uid) throw new Error('not your turn')
    const now = serverNow()
    const upd = { moves: [...g.moves, uci], lastMoveAt: fs.serverTimestamp(), drawOffer: null }
    if (g.tc.base != null) {
      const left = remainingFor(g, color, now)
      if (left <= 0) {
        tx.update(ref, { status: 'finished', result: { winner: color === 'w' ? 'b' : 'w', reason: 'timeout' }, endedAt: fs.serverTimestamp(), [color === 'w' ? 'clockW' : 'clockB']: 0 })
        return 'timeout'
      }
      upd[color === 'w' ? 'clockW' : 'clockB'] = left + (g.tc.inc || 0)
    }
    if (over) {
      upd.status = 'finished'
      upd.result = { winner: over[0], reason: over[1] }
      upd.endedAt = fs.serverTimestamp()
    }
    tx.update(ref, upd)
    return 'ok'
  })
}

async function finish(code, winner, reason, guard) {
  const { db, fs } = await load()
  const ref = fs.doc(db, 'games', code)
  return fs.runTransaction(db, async (tx) => {
    const s = await tx.get(ref)
    const g = s.data()
    if (!g || g.status !== 'active') return false
    if (guard && !guard({ ...g, lastMoveAt: ms(g.lastMoveAt), seenW: ms(g.seenW), seenB: ms(g.seenB), moves: g.moves || [] })) return false
    tx.update(ref, { status: 'finished', result: { winner, reason }, endedAt: fs.serverTimestamp(), drawOffer: null })
    return true
  })
}

export const resignGame = (code, color) => finish(code, color === 'w' ? 'b' : 'w', 'resignation')

// a clock that ran out is only accepted when the server-time estimate agrees
export const flagGame = (code, loserColor) =>
  finish(code, loserColor === 'w' ? 'b' : 'w', 'timeout', (g) => g.tc.base != null && (g.moves.length % 2 === 0 ? 'w' : 'b') === loserColor && remainingFor(g, loserColor, serverNow()) <= 250)

// opponent has not been seen for a while
export const claimAbandon = (code, myColor) =>
  finish(code, myColor, 'abandoned', (g) => {
    const seen = myColor === 'w' ? g.seenB : g.seenW
    return serverNow() - (seen || g.lastMoveAt || 0) > 45000
  })

export async function offerDraw(code, color) {
  const { db, fs } = await load()
  await fs.updateDoc(fs.doc(db, 'games', code), { drawOffer: color })
}
export async function declineDraw(code) {
  const { db, fs } = await load()
  await fs.updateDoc(fs.doc(db, 'games', code), { drawOffer: null })
}
export const acceptDraw = (code) => finish(code, null, 'draw by agreement')

export async function heartbeat(code, color) {
  const { db, fs } = await load()
  try {
    await fs.updateDoc(fs.doc(db, 'games', code), { [color === 'w' ? 'seenW' : 'seenB']: fs.serverTimestamp() })
  } catch {
    /* offline */
  }
}

export async function createRematch(profile, oldGame, myColor) {
  const { db, fs } = await load()
  const newColor = myColor === 'w' ? 'b' : 'w'
  const code = await createGame(profile, { tc: oldGame.tc, color: newColor })
  await fs.updateDoc(fs.doc(db, 'games', oldGame.code), { rematch: code })
  return code
}

// Applies Elo + writes history once per player per game (idempotent through eloApplied).
export async function settleGame(code, uid) {
  const { db, fs } = await load()
  const gref = fs.doc(db, 'games', code)
  const uref = fs.doc(db, 'users', uid)
  return fs.runTransaction(db, async (tx) => {
    const [gs, us] = await Promise.all([tx.get(gref), tx.get(uref)])
    const g = gs.data()
    const u = us.data()
    if (!g || !u || g.status !== 'finished' || g.eloApplied?.[uid]) return null
    const color = g.white?.uid === uid ? 'w' : g.black?.uid === uid ? 'b' : null
    if (!color) return null
    const opp = color === 'w' ? g.black : g.white
    const w = g.result?.winner
    const score = w == null ? 0.5 : w === color ? 1 : 0
    const rated = (g.moves || []).length >= 4
    const delta = rated ? eloDelta(u.rating, opp?.rating ?? 1200, score, u.games || 0) : 0
    const rating = u.rating + delta
    tx.update(gref, { [`eloApplied.${uid}`]: true })
    tx.update(uref, {
      rating,
      games: (u.games || 0) + 1,
      wins: (u.wins || 0) + (score === 1 ? 1 : 0),
      losses: (u.losses || 0) + (score === 0 ? 1 : 0),
      draws: (u.draws || 0) + (score === 0.5 ? 1 : 0),
      activeGame: null,
    })
    tx.set(fs.doc(db, 'users', uid, 'history', code), {
      mode: 'online',
      code,
      color,
      opp: opp?.name || 'Opponent',
      oppRating: opp?.rating ?? 1200,
      result: score === 1 ? 'win' : score === 0 ? 'loss' : 'draw',
      reason: g.result?.reason || '',
      delta,
      rating,
      rated,
      tc: g.tc?.id || 'inf',
      moves: g.moves || [],
      at: fs.serverTimestamp(),
    })
    return { delta, rating, rated }
  })
}

/* ----------------------------- matchmaking ----------------------------- */
export async function joinQueue(profile, tcId) {
  const { db, fs } = await load()
  await fs.setDoc(fs.doc(db, 'queue', profile.uid), { uid: profile.uid, name: profile.name, rating: profile.rating ?? 1200, tc: tcId, at: fs.serverTimestamp(), matched: null })
}

export async function leaveQueue(uid) {
  const { db, fs } = await load()
  try {
    await fs.deleteDoc(fs.doc(db, 'queue', uid))
  } catch {
    /* ignore */
  }
}

export async function watchQueue(uid, cb) {
  const { db, fs } = await load()
  return fs.onSnapshot(fs.doc(db, 'queue', uid), (s) => cb(s.exists() ? s.data() : null))
}

// try to pair with the closest-rated waiting player; returns the game code or null
export async function tryPair(profile, tc) {
  const { db, fs } = await load()
  const q = fs.query(fs.collection(db, 'queue'), fs.where('tc', '==', tc.id), fs.limit(25))
  const s = await fs.getDocs(q)
  const now = serverNow()
  const cands = s.docs
    .map((d) => d.data({ serverTimestamps: 'estimate' }))
    .filter((d) => d.uid !== profile.uid && !d.matched && now - (ms(d.at) || now) < 90000)
    .sort((a, b) => Math.abs(a.rating - profile.rating) - Math.abs(b.rating - profile.rating))
  for (const c of cands) {
    const code = genCode()
    const mine = fs.doc(db, 'queue', profile.uid)
    const theirs = fs.doc(db, 'queue', c.uid)
    const gref = fs.doc(db, 'games', code)
    try {
      const ok = await fs.runTransaction(db, async (tx) => {
        const [a, b] = await Promise.all([tx.get(mine), tx.get(theirs)])
        if (!a.exists() || !b.exists() || a.data().matched || b.data().matched) return false
        const iAmWhite = Math.random() < 0.5
        const me = slot(profile)
        const them = { uid: c.uid, name: c.name, rating: c.rating }
        tx.set(gref, {
          ...newGameDoc(code, tc, profile, 'w', {}),
          white: iAmWhite ? me : them,
          black: iAmWhite ? them : me,
          players: [profile.uid, c.uid],
          status: 'active',
          lastMoveAt: fs.serverTimestamp(),
          createdAt: fs.serverTimestamp(),
          seenW: null,
          seenB: null,
          quick: true,
        })
        tx.update(mine, { matched: code })
        tx.update(theirs, { matched: code })
        return true
      })
      if (ok) return code
    } catch {
      /* try the next candidate */
    }
  }
  return null
}
