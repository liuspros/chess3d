import { countryOf, quote, send, wrap, httpError } from './_lib.js'
import { BY_ID, expand, priceCents } from '../src/data/catalog.js'

// GET /api/quote?items=a,b  ->  what the buyer will be charged in their local currency
export default wrap(async (req, res) => {
  const ids = String(req.query?.items || '').split(',').filter(Boolean)
  const known = ids.filter((i) => BY_ID[i] && !BY_ID[i].free)
  if (!known.length) throw httpError(400, 'No items')
  const cents = priceCents(known)
  const q = await quote(cents, countryOf(req))
  send(res, 200, { usdCents: cents, currency: q.currency, amount: q.major, country: q.country, unlocks: expand(known) })
})
