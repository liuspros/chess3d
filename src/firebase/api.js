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

const boardCache = new Map()
export async function getTopPlayers(n = 50, field = 'rating') {
  const hit = boardCache.get(field)
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.rows // saves reads on the free plan
  const { db, fs } = await load()
  const q = fs.query(fs.collection(db, 'users'), fs.orderBy(field, 'desc'), fs.limit(n + 20))
  const s = await fs.getDocs(q)
  const rows = s.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((p) => !p.guest && (p.games || 0) > 0)
    .slice(0, n)
  boardCache.set(field, { at: Date.now(), rows })
  return rows
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
    return serverNow() - (seen || g.lastMoveAt || 0) > 100000
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
    const delta = rated ? eloDelta(u.rating, opp?.rating ?? 1200, score, u.games || 0, u.provisional || 0) : 0
    const rating = u.rating + delta
    tx.update(gref, { [`eloApplied.${uid}`]: true })
    tx.update(uref, {
      rating,
      games: (u.games || 0) + 1,
      wins: (u.wins || 0) + (score === 1 ? 1 : 0),
      losses: (u.losses || 0) + (score === 0 ? 1 : 0),
      draws: (u.draws || 0) + (score === 0.5 ? 1 : 0),
      activeGame: null,
      ...(rated && u.provisional > 0 ? { provisional: u.provisional - 1, rd: Math.max(60, Math.round((u.rd || 200) * 0.93)) } : {}),
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

/* ------------------------------ shop ------------------------------ */
export async function getIdToken() {
  const m = await load()
  const u = m.auth.currentUser
  if (!u) throw new Error('Sign in first.')
  return u.getIdToken()
}

// ids of items this player owns (written only by the server after Paystack confirms payment)
export async function getInventory(uid) {
  const { db, fs } = await load()
  const s = await fs.getDocs(fs.collection(db, 'users', uid, 'inventory'))
  return s.docs.map((d) => d.id)
}

/* ------------------------------ chat + reactions ------------------------------ */
// Free-plan friendly: one small doc per message, last 40 only, deleted when the game is left.
export const CHAT_MAX = 200

export async function sendChat(code, profile, text) {
  const t = String(text || '').trim().slice(0, CHAT_MAX)
  if (!t) return
  const { db, fs } = await load()
  await fs.addDoc(fs.collection(db, 'games', code, 'chat'), { uid: profile.uid, name: profile.name || 'Player', text: t, at: fs.serverTimestamp() })
}

export async function subscribeChat(code, cb) {
  const { db, fs } = await load()
  const q = fs.query(fs.collection(db, 'games', code, 'chat'), fs.orderBy('at', 'desc'), fs.limit(40))
  return fs.onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), at: ms(d.data({ serverTimestamps: 'estimate' }).at) })).reverse()),
    () => {},
  )
}

export async function clearChat(code) {
  try {
    const { db, fs } = await load()
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'games', code, 'chat'), fs.limit(100)))
    await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref || fs.doc(db, 'games', code, 'chat', d.id))))
  } catch {
    /* best effort */
  }
}

export async function sendReaction(code, color, id) {
  const { db, fs } = await load()
  await fs.updateDoc(fs.doc(db, 'games', code), { react: { c: color, id, n: Date.now() } })
}

/* ------------------------------ friends + challenges ------------------------------ */
// Friend codes find people without a user search; requests/challenges are single tiny docs.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const genFriendCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

export async function ensureFriendCode(profile) {
  if (profile.friendCode) return profile.friendCode
  const { db, fs } = await load()
  for (let i = 0; i < 6; i++) {
    const code = genFriendCode()
    const q = await fs.getDocs(fs.query(fs.collection(db, 'users'), fs.where('friendCode', '==', code), fs.limit(1)))
    if (q.docs.length) continue
    await fs.updateDoc(fs.doc(db, 'users', profile.uid), { friendCode: code })
    return code
  }
  throw new Error('Could not create a friend code, try again')
}

export async function findByCode(raw) {
  const { db, fs } = await load()
  const code = String(raw || '').trim().toUpperCase()
  if (code.length < 6) return null
  const q = await fs.getDocs(fs.query(fs.collection(db, 'users'), fs.where('friendCode', '==', code), fs.limit(1)))
  const d = q.docs[0]
  return d ? { uid: d.id, ...d.data() } : null
}

export async function sendFriendRequest(me, target) {
  if (target.uid === me.uid) throw new Error('That is your own code.')
  const { db, fs } = await load()
  const mine = await fs.getDoc(fs.doc(db, 'users', me.uid, 'friends', target.uid))
  if (mine.exists()) throw new Error('You are already friends.')
  await fs.setDoc(fs.doc(db, 'requests', `${target.uid}_${me.uid}`), { to: target.uid, from: { uid: me.uid, name: me.name, rating: me.rating || 1200 }, at: fs.serverTimestamp() })
}

export async function getRequests(uid) {
  const { db, fs } = await load()
  const q = await fs.getDocs(fs.query(fs.collection(db, 'requests'), fs.where('to', '==', uid), fs.limit(30)))
  return q.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function answerRequest(me, req, accept) {
  const { db, fs } = await load()
  if (accept) {
    await fs.setDoc(fs.doc(db, 'users', me.uid, 'friends', req.from.uid), { name: req.from.name, at: fs.serverTimestamp() })
    await fs.setDoc(fs.doc(db, 'users', req.from.uid, 'friends', me.uid), { name: me.name, at: fs.serverTimestamp() })
  }
  await fs.deleteDoc(fs.doc(db, 'requests', req.id))
}

export async function getFriends(uid) {
  const { db, fs } = await load()
  const q = await fs.getDocs(fs.query(fs.collection(db, 'users', uid, 'friends'), fs.limit(100)))
  return Promise.all(
    q.docs.map(async (d) => {
      const p = await fs.getDoc(fs.doc(db, 'users', d.id))
      return { uid: d.id, name: d.data().name, ...(p.exists() ? { rating: p.data().rating, name: p.data().name } : {}) }
    }),
  )
}

export async function removeFriend(me, uid) {
  const { db, fs } = await load()
  await fs.deleteDoc(fs.doc(db, 'users', me, 'friends', uid))
}

export async function sendChallenge(me, toUid, code, tc) {
  const { db, fs } = await load()
  await fs.setDoc(fs.doc(db, 'challenges', toUid), { from: { uid: me.uid, name: me.name, rating: me.rating || 1200 }, code, tc: { id: tc.id, label: tc.label }, at: fs.serverTimestamp() })
}

export async function subscribeChallenge(uid, cb) {
  const { db, fs } = await load()
  return fs.onSnapshot(
    fs.doc(db, 'challenges', uid),
    (s) => {
      if (!s.exists()) return cb(null)
      const d = s.data({ serverTimestamps: 'estimate' })
      cb({ ...d, at: ms(d.at) })
    },
    () => {},
  )
}

export async function clearChallenge(uid) {
  try {
    const { db, fs } = await load()
    await fs.deleteDoc(fs.doc(db, 'challenges', uid))
  } catch {
    /* ignore */
  }
}

/* ------------------------------ push notifications ------------------------------ */
// Firebase Cloud Messaging is free. The token is stored under the user; /api/notify sends the pushes.
export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window

export async function registerPush(uid, vapidKey) {
  if (!pushSupported() || !vapidKey) throw new Error('Notifications are not available on this device.')
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked in your browser settings.')
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Permission was not given.')
  const { a, db, fs } = await load()
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) throw new Error('This browser does not support push.')
  const reg = await navigator.serviceWorker.ready
  const token = await getToken(getMessaging(a), { vapidKey, serviceWorkerRegistration: reg })
  if (!token) throw new Error('Could not get a notification token.')
  await fs.setDoc(fs.doc(db, 'users', uid, 'tokens', token), { at: fs.serverTimestamp(), ua: navigator.userAgent.slice(0, 80) })
  try {
    localStorage.setItem('chess3d.pushToken', token)
  } catch {
    /* ignore */
  }
  return token
}

export async function unregisterPush(uid) {
  let token = null
  try {
    token = localStorage.getItem('chess3d.pushToken')
    localStorage.removeItem('chess3d.pushToken')
  } catch {
    /* ignore */
  }
  if (!token) return
  const { db, fs } = await load()
  await fs.deleteDoc(fs.doc(db, 'users', uid, 'tokens', token)).catch(() => {})
}

// fire-and-forget: tell the server to push the other player (it validates everything itself)
export async function notify(payload) {
  try {
    const BASE = import.meta.env?.VITE_API_BASE || ''
    const tok = await getIdToken()
    await fetch(BASE + '/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(payload), keepalive: true })
  } catch {
    /* best effort */
  }
}

// Rating import (server checks the one-time code on the person's Lichess / Chess.com profile)
export async function importRequest(payload) {
  const BASE = import.meta.env?.VITE_API_BASE || ''
  const tok = await getIdToken()
  const r = await fetch(BASE + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(payload) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Import failed. Try again.')
  return j
}
