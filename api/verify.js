import { fulfill, getDb, httpError, readJson, send, verifyBearer, wrap } from './_lib.js'

// POST /api/verify { reference } — called when the buyer returns from Paystack
export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw httpError(405, 'POST only')
  const user = await verifyBearer(req)
  const { reference } = await readJson(req)
  if (!reference || typeof reference !== 'string') throw httpError(400, 'Missing reference')
  const snap = await (await getDb()).collection('orders').doc(reference).get()
  if (!snap.exists || snap.data().uid !== user.uid) throw httpError(404, 'Order not found.')
  send(res, 200, await fulfill(reference))
})
