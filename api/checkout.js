import crypto from 'node:crypto'
import { buildOrder, countryOf, getDb, httpError, paystack, quote, readJson, send, serverTs, verifyBearer, wrap } from './_lib.js'

// POST /api/checkout { items: [ids] }  (Authorization: Bearer <Firebase ID token>)
// -> { url } to redirect the buyer to Paystack
export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw httpError(405, 'POST only')
  const user = await verifyBearer(req)
  const body = await readJson(req)
  const order = await buildOrder(user.uid, body.items)

  const country = countryOf(req)
  let q = await quote(order.cents, country)
  const reference = `c3d_${user.uid.slice(0, 6)}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  const origin = (req.headers.origin || `https://${req.headers.host}`).replace(/\/$/, '')
  const email = user.email || body.email || `${user.uid}@players.chess3d.app`

  const start = async (qq) => {
    const db = await getDb()
    await db.collection('orders').doc(reference).set({
      uid: user.uid,
      items: order.picked,
      unlocks: order.unlocks,
      usdCents: order.cents,
      currency: qq.currency,
      minor: qq.minor,
      country: qq.country,
      status: 'pending',
      createdAt: await serverTs(),
    })
    return paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: qq.minor,
        currency: qq.currency,
        reference,
        callback_url: `${origin}/?paid=${reference}`,
        metadata: { uid: user.uid, items: order.picked, cancel_action: `${origin}/?paid=cancelled` },
      }),
    })
  }

  let data
  try {
    data = await start(q)
  } catch (e) {
    // USD not enabled on the Paystack account -> charge the naira equivalent instead
    if (q.currency === 'USD') {
      q = await quote(order.cents, 'NG')
      data = await start(q)
    } else throw e
  }
  send(res, 200, { url: data.authorization_url, reference, currency: q.currency, amount: q.major })
})
