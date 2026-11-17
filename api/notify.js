import { getDb, httpError, pushTo, readJson, send, verifyBearer, wrap } from './_lib.js'

// POST /api/notify { type: 'move' | 'challenge' | 'friend', code?, to? }
// Sends a push to the other person. Every request is validated against Firestore, so nobody can
// spam arbitrary users: the caller must really be in that game / have that request / challenge.
const recent = new Map() // best-effort throttle per sender->recipient (per server instance)
const THROTTLE_MS = 20000

export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw httpError(405, 'POST only')
  const user = await verifyBearer(req)
  const { type, code, to } = await readJson(req)
  const db = await getDb()
  let target
  let msg
  if (type === 'move') {
    const g = (await db.collection('games').doc(String(code || '')).get())
    if (!g.exists) throw httpError(404, 'Game not found')
    const d = g.data()
    if (!(d.players || []).includes(user.uid) || d.status !== 'active') throw httpError(403, 'Not your game')
    target = d.players.find((u) => u !== user.uid)
    const me = d.white?.uid === user.uid ? d.white : d.black
    const turnIsTarget = (d.moves?.length || 0) % 2 === (d.white?.uid === target ? 0 : 1)
    if (!target || !turnIsTarget) throw httpError(409, 'Not their turn')
    msg = { title: `${me?.name || 'Your opponent'} played`, body: 'It is your move.', url: `/?join=${code}`, tag: `move-${code}` }
  } else if (type === 'challenge') {
    const c = await db.collection('challenges').doc(String(to || '')).get()
    if (!c.exists || c.data().from?.uid !== user.uid) throw httpError(403, 'No such challenge')
    target = to
    msg = { title: `${c.data().from.name} challenges you`, body: `${c.data().tc?.label || 'Chess'} game. Tap to accept.`, url: `/?join=${c.data().code}`, tag: `challenge-${user.uid}` }
  } else if (type === 'friend') {
    const r = await db.collection('requests').doc(`${to}_${user.uid}`).get()
    if (!r.exists) throw httpError(403, 'No such request')
    target = to
    msg = { title: 'New friend request', body: `${r.data().from.name} wants to be your friend.`, url: '/', tag: `friend-${user.uid}` }
  } else throw httpError(400, 'Unknown type')

  const key = `${user.uid}>${target}>${type}`
  const now = Date.now()
  if (now - (recent.get(key) || 0) < THROTTLE_MS) return send(res, 200, { sent: 0, throttled: true })
  recent.set(key, now)

  const snap = await db.collection('users').doc(target).collection('tokens').get()
  const tokens = snap.docs.map((d) => d.id)
  const { bad } = await pushTo(tokens, msg)
  for (const t of bad) await db.collection('users').doc(target).collection('tokens').doc(t).delete?.().catch?.(() => {})
  send(res, 200, { sent: tokens.length - bad.length })
})
