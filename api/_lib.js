// Shared helpers for the Vercel API. Runs on the free Vercel plan + Firebase Spark plan:
// the Firebase Admin SDK only needs the service-account key, no paid Firebase features.
import crypto from 'node:crypto'
import { BY_ID, expand, priceCents } from '../src/data/catalog.js'

// Currencies Paystack can settle. Anything else is charged in USD (needs USD enabled on the
// Paystack account) and falls back to NGN.
export const COUNTRY_CURRENCY = { NG: 'NGN', GH: 'GHS', ZA: 'ZAR', KE: 'KES' }
const FALLBACK_RATES = { NGN: 1500, GHS: 15, ZAR: 18, KES: 129, USD: 1 }
const ROUND_TO = { NGN: 10, GHS: 1, ZAR: 1, KES: 10, USD: 0.01 }

// mutable so tests can swap in fakes
export const deps = {
  fetch: (...a) => fetch(...a),
  db: null,
  push: null, // (tokens, data) => Promise<{ bad: string[] }>   swapped in tests
  verifyToken: null,
  env: (k) => process.env[k],
}

let adminReady = null
async function admin() {
  if (adminReady) return adminReady
  adminReady = (async () => {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app')
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore')
    const { getAuth } = await import('firebase-admin/auth')
    if (!getApps().length) {
      const raw = deps.env('FIREBASE_SERVICE_ACCOUNT')
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
      const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
      initializeApp({ credential: cert(JSON.parse(json)) })
    }
    return { db: getFirestore(), auth: getAuth(), FieldValue }
  })()
  return adminReady
}
export async function getDb() {
  if (deps.db) return deps.db
  return (await admin()).db
}
export async function serverTs() {
  if (deps.db?.serverTs) return deps.db.serverTs()
  return (await admin()).FieldValue.serverTimestamp()
}
export async function verifyBearer(req) {
  const h = req.headers.authorization || ''
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!tok) throw httpError(401, 'Sign in first.')
  let auth
  try {
    auth = deps.verifyToken ? null : (await admin()).auth
  } catch (e) {
    // server setup problem (missing / malformed FIREBASE_SERVICE_ACCOUNT), not the person's fault
    console.error('Firebase admin setup failed:', e.message)
    throw httpError(500, 'Server is not set up yet: check FIREBASE_SERVICE_ACCOUNT on Vercel.')
  }
  try {
    return deps.verifyToken ? await deps.verifyToken(tok) : await auth.verifyIdToken(tok)
  } catch (e) {
    console.error('verifyIdToken failed:', e.code || e.message)
    throw httpError(401, 'Your session expired. Sign in again.')
  }
}

export function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

export function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body)
}

export function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (e) {
      if (!e.status) console.error(e)
      send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong. Try again.' })
    }
  }
}

export async function readRaw(req) {
  if (typeof req.rawBody === 'string') return req.rawBody
  const chunks = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks).toString('utf8')
}
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const raw = await readRaw(req)
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw httpError(400, 'Bad request')
  }
}

/* ------------------------------ money ------------------------------ */
let rateCache = { at: 0, rates: null }
export async function getRates() {
  if (rateCache.rates && Date.now() - rateCache.at < 6 * 3600e3) return rateCache.rates
  try {
    const r = await deps.fetch('https://open.er-api.com/v6/latest/USD')
    const j = await r.json()
    if (j?.rates?.NGN) {
      rateCache = { at: Date.now(), rates: j.rates }
      return j.rates
    }
  } catch {
    /* use fallback */
  }
  return rateCache.rates || FALLBACK_RATES
}

export function countryOf(req) {
  return (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toString().toUpperCase()
}

// local price for a USD-cents amount; amount is in the currency's minor unit (kobo, pesewas, cents)
export async function quote(usdCents, country) {
  const currency = COUNTRY_CURRENCY[country] || 'USD'
  const rates = await getRates()
  const rate = rates[currency] || FALLBACK_RATES[currency] || 1
  const step = ROUND_TO[currency] || 1
  const major = Math.ceil((usdCents / 100) * rate / step) * step // round up to a clean price
  return { currency, major, minor: Math.round(major * 100), rate, country: country || '' }
}

/* ------------------------------ paystack ------------------------------ */
export async function paystack(path, init = {}) {
  const key = deps.env('PAYSTACK_SECRET_KEY')
  if (!key) throw httpError(500, 'Payments are not set up yet.')
  const r = await deps.fetch('https://api.paystack.co' + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.status === false) {
    const e = new Error(j.message || 'Paystack error')
    e.status = 502
    e.paystack = j
    throw e
  }
  return j.data
}

export function validSignature(raw, sig) {
  const key = deps.env('PAYSTACK_SECRET_KEY')
  if (!key || !sig) return false
  const h = crypto.createHmac('sha512', key).update(raw).digest('hex')
  const a = Buffer.from(h)
  const b = Buffer.from(String(sig))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/* ------------------------------ orders ------------------------------ */
// Turns a list of requested ids into a validated order (what to unlock, what it costs).
export async function buildOrder(uid, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20) throw httpError(400, 'Pick something to buy.')
  const picked = [...new Set(ids)]
  for (const id of picked) {
    const it = BY_ID[id]
    if (!it || it.free) throw httpError(400, 'That item is not for sale.')
  }
  const db = await getDb()
  const owned = new Set((await db.collection('users').doc(uid).collection('inventory').get()).docs.map((d) => d.id))
  const unlocks = expand(picked).filter((x) => !owned.has(x))
  if (!unlocks.length) throw httpError(409, 'You already own that.')
  // never charge for pieces of a bundle the buyer already owns more than the bundle costs
  let cents = priceCents(picked)
  for (const id of picked) {
    const it = BY_ID[id]
    if (it.kind === 'bundle') {
      const stillNeeded = it.includes.filter((x) => !owned.has(x))
      const partsCents = priceCents(stillNeeded)
      if (partsCents < it.usd) cents -= it.usd - partsCents
    }
  }
  return { picked, unlocks, cents: Math.max(100, cents) }
}

// idempotent: grants the items once, whichever of webhook / verify arrives first
export async function fulfill(reference) {
  const db = await getDb()
  const ref = db.collection('orders').doc(reference)
  const snap = await ref.get()
  if (!snap.exists) throw httpError(404, 'Order not found.')
  const order = snap.data()
  if (order.status === 'paid') return { status: 'paid', items: order.unlocks }

  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
  if (tx.status !== 'success') return { status: tx.status === 'abandoned' || tx.status === 'failed' ? tx.status : 'pending', items: [] }
  if (tx.currency !== order.currency || tx.amount < order.minor) {
    await ref.update({ status: 'mismatch', paid: { amount: tx.amount, currency: tx.currency } })
    throw httpError(402, 'Payment amount did not match. Contact support with your reference: ' + reference)
  }

  const ts = await serverTs()
  await db.runTransaction(async (t) => {
    const cur = await t.get(ref)
    if (cur.data().status === 'paid') return
    for (const id of order.unlocks) {
      t.set(db.collection('users').doc(order.uid).collection('inventory').doc(id), { at: ts, ref: reference, via: 'paystack' })
    }
    t.update(ref, { status: 'paid', paidAt: ts, paid: { amount: tx.amount, currency: tx.currency, channel: tx.channel || null } })
  })
  return { status: 'paid', items: order.unlocks }
}

// Sends a data-only web push through Firebase Cloud Messaging (free). Returns tokens that are dead.
export async function pushTo(tokens, data) {
  if (!tokens.length) return { bad: [] }
  if (deps.push) return deps.push(tokens, data)
  await admin()
  const { getMessaging } = await import('firebase-admin/messaging')
  const r = await getMessaging().sendEachForMulticast({
    tokens,
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    webpush: { headers: { Urgency: 'high', TTL: '3600' } },
  })
  const bad = []
  r.responses.forEach((x, i) => {
    const c = x.error?.code || ''
    if (!x.success && (c.includes('registration-token-not-registered') || c.includes('invalid-argument'))) bad.push(tokens[i])
  })
  return { bad }
}
