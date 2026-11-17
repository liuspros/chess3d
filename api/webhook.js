import { fulfill, readRaw, send, validSignature, wrap } from './_lib.js'

// Paystack dashboard -> Settings -> API Keys & Webhooks -> Webhook URL: https://<your-domain>/api/webhook
export const config = { api: { bodyParser: false } }

export default wrap(async (req, res) => {
  const raw = await readRaw(req)
  if (!validSignature(raw, req.headers['x-paystack-signature'])) return send(res, 401, { error: 'bad signature' })
  const evt = JSON.parse(raw)
  if (evt.event === 'charge.success' && evt.data?.reference?.startsWith('c3d_')) {
    try {
      await fulfill(evt.data.reference)
    } catch (e) {
      console.error('fulfil failed', evt.data.reference, e.message)
      return send(res, 500, { error: 'retry' }) // Paystack retries on non-200
    }
  }
  send(res, 200, { ok: true })
})
