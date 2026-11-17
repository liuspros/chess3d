// Run: node test/api.test.mjs   (fakes Paystack, exchange rates and Firestore)
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { deps } from '../api/_lib.js'
import quote from '../api/quote.js'
import checkout from '../api/checkout.js'
import verify from '../api/verify.js'
import webhook from '../api/webhook.js'
import notify from '../api/notify.js'

const store = new Map()
const mkDb = () => {
  const docRef = (path) => ({
    get: async () => ({ exists: store.has(path), id: path.split('/').pop(), data: () => store.get(path) }),
    set: async (d) => void store.set(path, d),
    update: async (d) => store.set(path, { ...store.get(path), ...d }),
    collection: (n) => colRef(path + '/' + n),
    _path: path,
  })
  const colRef = (path) => ({
    doc: (id) => docRef(path + '/' + id),
    get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).map((k) => ({ id: k.split('/').pop(), data: () => store.get(k) })) }),
  })
  return {
    collection: colRef,
    serverTs: () => 'TS',
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d) => r.set(d), update: (r, d) => r.update(d) }),
  }
}
deps.db = mkDb()
deps.verifyToken = async (t) => (t === 'tok-a' ? { uid: 'userAAAAAA', email: 'a@x.com' } : (() => { throw new Error('bad') })())
const env = { PAYSTACK_SECRET_KEY: 'sk_test_123' }
deps.env = (k) => env[k]

let paystackPaid = true
const calls = []
deps.fetch = async (url, init = {}) => {
  calls.push(url)
  const json = (d, ok = true) => ({ ok, json: async () => d })
  if (url.includes('er-api')) return json({ rates: { NGN: 1600, GHS: 15.5, ZAR: 18, KES: 130 } })
  if (url.endsWith('/transaction/initialize')) {
    const b = JSON.parse(init.body)
    if (b.currency === 'USD' && env.NO_USD) return json({ status: false, message: 'Currency not supported' }, false)
    return json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', reference: b.reference } })
  }
  if (url.includes('/transaction/verify/')) {
    const ref = decodeURIComponent(url.split('/').pop())
    const o = store.get('orders/' + ref)
    return json({ status: true, data: { status: paystackPaid ? 'success' : 'abandoned', amount: o.paidOverride ?? o.minor, currency: o.currency, channel: 'card' } })
  }
  throw new Error('unexpected ' + url)
}

const mkRes = () => { const r = { code: 0, body: null, headers: {} }; r.status = (c) => ((r.code = c), r); r.setHeader = () => r; r.json = (b) => ((r.body = b), r); return r }
const call = async (h, req) => { const res = mkRes(); await h({ method: 'POST', headers: {}, query: {}, ...req }, res); return res }

// quote in naira / cedis / usd
let r = await call(quote, { method: 'GET', query: { items: 'board_onyx' }, headers: { 'x-vercel-ip-country': 'NG' } })
assert.equal(r.code, 200); assert.equal(r.body.currency, 'NGN'); assert.equal(r.body.amount, 4790) // 2.99*1600=4784 -> round up to 4790
r = await call(quote, { method: 'GET', query: { items: 'board_onyx' }, headers: { 'x-vercel-ip-country': 'GH' } })
assert.equal(r.body.currency, 'GHS'); assert.equal(r.body.amount, 47) // 2.99*15.5=46.3 -> 47
r = await call(quote, { method: 'GET', query: { items: 'board_onyx,set_gold' }, headers: { 'x-vercel-ip-country': 'US' } })
assert.equal(r.body.currency, 'USD'); assert.equal(r.body.amount, 7.98)
r = await call(quote, { method: 'GET', query: { items: 'board_classic' } })
assert.equal(r.code, 400)

// checkout requires auth
r = await call(checkout, { body: { items: ['board_onyx'] } })
assert.equal(r.code, 401)
// checkout ok
r = await call(checkout, { headers: { authorization: 'Bearer tok-a', 'x-vercel-ip-country': 'NG', host: 'chess.app' }, body: { items: ['board_onyx'] } })
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.match(r.body.url, /paystack/)
const ref = r.body.reference
assert.equal(store.get('orders/' + ref).minor, 479000)
assert.equal(store.get('orders/' + ref).status, 'pending')
// not paid yet -> nothing granted
paystackPaid = false
r = await call(verify, { headers: { authorization: 'Bearer tok-a' }, body: { reference: ref } })
assert.equal(r.body.status, 'abandoned'); assert.equal(store.has('users/userAAAAAA/inventory/board_onyx'), false)
// paid -> granted once
paystackPaid = true
r = await call(verify, { headers: { authorization: 'Bearer tok-a' }, body: { reference: ref } })
assert.equal(r.body.status, 'paid'); assert.ok(store.has('users/userAAAAAA/inventory/board_onyx'))
// already owned
r = await call(checkout, { headers: { authorization: 'Bearer tok-a' }, body: { items: ['board_onyx'] } })
assert.equal(r.code, 409)
// someone else's order cannot be verified
deps.verifyToken = async (t) => ({ uid: 'otherUser', email: 'o@x.com' })
r = await call(verify, { headers: { authorization: 'Bearer z' }, body: { reference: ref } })
assert.equal(r.code, 404)
deps.verifyToken = async () => ({ uid: 'userAAAAAA', email: 'a@x.com' })

// bundle: expands, and discounts parts already owned
r = await call(checkout, { headers: { authorization: 'Bearer t', 'x-vercel-ip-country': 'US', host: 'h' }, body: { items: ['bundle_all'] } })
assert.equal(r.code, 200); const bref = r.body.reference
const bo = store.get('orders/' + bref)
assert.ok(!bo.unlocks.includes('board_onyx')); assert.equal(bo.unlocks.length, 10)
assert.equal(bo.usdCents, 1999) // remaining parts still cost more than the bundle
// USD not enabled -> falls back to NGN
env.NO_USD = true
r = await call(checkout, { headers: { authorization: 'Bearer t', 'x-vercel-ip-country': 'FR', host: 'h' }, body: { items: ['set_modern'] } })
assert.equal(r.code, 200); assert.equal(r.body.currency, 'NGN')
delete env.NO_USD

// webhook: signature + idempotent grant
const ev = JSON.stringify({ event: 'charge.success', data: { reference: bref } })
const sig = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(ev).digest('hex')
const mkReq = (raw, s) => ({ method: 'POST', headers: { 'x-paystack-signature': s }, rawBody: raw })
r = await call(webhook, mkReq(ev, 'wrong')); assert.equal(r.code, 401)
r = await call(webhook, mkReq(ev, sig)); assert.equal(r.code, 200)
assert.equal(store.get('orders/' + bref).status, 'paid'); assert.ok(store.has('users/userAAAAAA/inventory/set_bronze'))
r = await call(webhook, mkReq(ev, sig)); assert.equal(r.code, 200)

// short payment is rejected
deps.verifyToken = async () => ({ uid: 'userBBBBBB', email: 'b@x.com' })
r = await call(checkout, { headers: { authorization: 'Bearer t', 'x-vercel-ip-country': 'NG', host: 'h' }, body: { items: ['set_modern'] } })
const sref = r.body.reference; store.get('orders/' + sref).paidOverride = store.get('orders/' + sref).minor; store.get('orders/' + sref).minor += 100 // paystack will report less than the order
r = await call(verify, { headers: { authorization: 'Bearer t' }, body: { reference: sref } })
assert.equal(r.code, 402); assert.equal(store.get('orders/' + sref).status, 'mismatch')
console.log('api tests passed')

// ---- push notifications
deps.verifyToken = async (t) => (t === 'tok-a' ? { uid: 'userAAAAAA' } : (() => { throw new Error('bad') })())
const pushed = []
deps.push = async (tokens, data) => { pushed.push({ tokens, data }); return { bad: [] } }
store.set('users/userBBBBBB/tokens/tokB', { at: 1 })
store.set('games/ABC123', { status: 'active', players: ['userAAAAAA', 'userBBBBBB'], white: { uid: 'userAAAAAA', name: 'Ann' }, black: { uid: 'userBBBBBB', name: 'Bob' }, moves: ['e2e4'] })
r = await call(notify, { body: { type: 'move', code: 'ABC123' } }); assert.equal(r.code, 401)
r = await call(notify, { headers: { authorization: 'Bearer tok-a' }, body: { type: 'move', code: 'ABC123' } })
assert.equal(r.code, 200); assert.equal(r.body.sent, 1); assert.deepEqual(pushed[0].tokens, ['tokB']); assert.match(pushed[0].data.title, /Ann/)
r = await call(notify, { headers: { authorization: 'Bearer tok-a' }, body: { type: 'move', code: 'ABC123' } })
assert.equal(r.body.throttled, true) // no spam
store.set('games/ZZZ999', { status: 'active', players: ['x', 'y'], moves: [] })
r = await call(notify, { headers: { authorization: 'Bearer tok-a' }, body: { type: 'move', code: 'ZZZ999' } }); assert.equal(r.code, 403) // not your game
r = await call(notify, { headers: { authorization: 'Bearer tok-a' }, body: { type: 'challenge', to: 'userBBBBBB' } }); assert.equal(r.code, 403) // no such challenge
store.set('challenges/userBBBBBB', { from: { uid: 'userAAAAAA', name: 'Ann' }, code: 'ABC123', tc: { label: '5 min' } })
r = await call(notify, { headers: { authorization: 'Bearer tok-a' }, body: { type: 'challenge', to: 'userBBBBBB' } }); assert.equal(r.body.sent, 1)
console.log('push tests passed')

// ---- import bridge
import importer from '../api/import.js'
import { lichessToApp, chesscomToApp, pickRating } from '../src/lib/ratingConvert.js'
assert.equal(lichessToApp(1400), 1100); assert.ok(lichessToApp(2000) === 1825); assert.equal(lichessToApp(2600), 2600)
assert.equal(chesscomToApp(1234), 1235)
assert.equal(pickRating('lichess', [{ kind: 'bullet', rating: 2000, games: 900 }, { kind: 'rapid', rating: 1500, games: 100 }]).kind, 'rapid') // bullet only as last resort
assert.equal(pickRating('chesscom', [{ kind: 'rapid', rating: 1800, games: 3 }]).rating, 1200 + Math.round((600 * 0.25) / 5) * 5) // few games: pulled toward 1200
assert.equal(pickRating('chesscom', []), null)

const realFetch = deps.fetch
let seenUA = ''
const bio = { v: 'hello' }
deps.env = (k) => ({ PAYSTACK_SECRET_KEY: 'sk_test_123', IMPORT_CONTACT_EMAIL: 'me@example.com' }[k])
deps.fetch = async (url, init = {}) => {
  seenUA = init.headers?.['User-Agent'] || seenUA
  const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d })
  if (url === 'https://lichess.org/api/user/magnus') return json({ username: 'Magnus', profile: { bio: bio.v }, perfs: { rapid: { rating: 1900, games: 200 }, blitz: { rating: 2100, games: 50 }, puzzle: { rating: 2300 } } })
  if (url.startsWith('https://lichess.org/api/user/')) return json({}, 404)
  if (url === 'https://api.chess.com/pub/player/hikaru') return json({ username: 'Hikaru', location: bio.v })
  if (url === 'https://api.chess.com/pub/player/hikaru/stats') return json({ chess_rapid: { last: { rating: 1000 }, record: { win: 10, loss: 10, draw: 0 } }, tactics: { highest: { rating: 1400 } } })
  return realFetch(url, init)
}
store.set('users/userAAAAAA', { name: 'Ann', rating: 1200, games: 0 })
store.set('users/userBBBBBB', { name: 'Bob', rating: 1200, games: 0 })
store.set('users/guestGGGGG', { name: 'G', rating: 1200, games: 0, guest: true })
deps.verifyToken = async (t) => (t === 'tok-a' ? { uid: 'userAAAAAA' } : t === 'tok-b' ? { uid: 'userBBBBBB' } : t === 'tok-g' ? { uid: 'guestGGGGG' } : (() => { throw new Error('bad') })())
const H = (t) => ({ headers: { authorization: 'Bearer ' + t } })
r = await call(importer, { body: { action: 'start' } }); assert.equal(r.code, 401)
r = await call(importer, { ...H('tok-g'), body: { action: 'start', platform: 'lichess', username: 'magnus' } }); assert.equal(r.code, 403)
r = await call(importer, { ...H('tok-a'), body: { action: 'start', platform: 'lichess', username: '../x' } }); assert.equal(r.code, 400)
r = await call(importer, { ...H('tok-a'), body: { action: 'verify' } }); assert.equal(r.code, 400) // not started
r = await call(importer, { ...H('tok-a'), body: { action: 'start', platform: 'lichess', username: 'magnus' } })
assert.equal(r.code, 200); assert.match(r.body.code, /^MIGRATE-\d{4}$/)
const code = r.body.code
r = await call(importer, { ...H('tok-a'), body: { action: 'verify' } }); assert.equal(r.code, 422) // code not on the profile yet
assert.match(seenUA, /Chess3D-Import\/1\.0 \(contact: me@example\.com\)/)
bio.v = `chess fan ${code}`
// someone else cannot claim by pasting a code on a profile that is not theirs: B's code differs from the bio
await call(importer, { ...H('tok-b'), body: { action: 'start', platform: 'lichess', username: 'magnus' } })
r = await call(importer, { ...H('tok-b'), body: { action: 'verify' } }); assert.equal(r.code, 422)
r = await call(importer, { ...H('tok-a'), body: { action: 'verify' } })
assert.equal(r.code, 200); assert.equal(r.body.raw, 1900); assert.equal(r.body.rating, lichessToApp(1900) ); assert.equal(r.body.puzzleRating, lichessToApp(2300)); assert.equal(r.body.provisional, 15)
assert.equal(store.get('users/userAAAAAA').provisional, 15); assert.ok(store.get('users/userAAAAAA').rd >= 110)
r = await call(importer, { ...H('tok-a'), body: { action: 'start', platform: 'lichess', username: 'magnus' } }); assert.equal(r.code, 409) // only once
// the same external account cannot be claimed twice
bio.v = store.get('imports/userBBBBBB').code
r = await call(importer, { ...H('tok-b'), body: { action: 'verify' } }); assert.equal(r.code, 409)
// chess.com via location
await call(importer, { ...H('tok-b'), body: { action: 'start', platform: 'chesscom', username: 'Hikaru' } })
bio.v = store.get('imports/userBBBBBB').code
r = await call(importer, { ...H('tok-b'), body: { action: 'verify' } }); assert.equal(r.code, 200); assert.equal(r.body.puzzleRating, 1400)
assert.equal(r.body.rating, 1200 + Math.round(((1000 - 1200) * (20 / 30)) / 5) * 5)
// code expires
await call(importer, { ...H('tok-g'), body: {} })
deps.fetch = realFetch
console.log('import tests passed')

// ---- lichess oauth
{
  const tokenCalls = []
  deps.fetch = async (url, init = {}) => {
    const json = (d, status = 200) => ({ ok: status < 400, status, json: async () => d })
    if (url === 'https://lichess.org/api/token') {
      tokenCalls.push(init.method)
      if (init.method === 'DELETE') return json({})
      const b = new URLSearchParams(init.body)
      return b.get('code') === 'goodcode' && b.get('code_verifier') === 'ver' ? json({ access_token: 'lip_tok' }) : json({ error: 'bad' }, 400)
    }
    if (url === 'https://lichess.org/api/account') return init.headers.Authorization === 'Bearer lip_tok' ? json({ username: 'Cara' }) : json({}, 401)
    if (url === 'https://lichess.org/api/user/Cara') return json({ username: 'Cara', profile: {}, perfs: { rapid: { rating: 1600, games: 80 }, puzzle: { rating: 1800 } } })
    return realFetch(url, init)
  }
  store.set('users/userCCCCCC', { name: 'Cara', rating: 1200, games: 0 })
  deps.verifyToken = async () => ({ uid: 'userCCCCCC' })
  r = await call(importer, { ...H('x'), body: { action: 'lichess_oauth', code: 'wrong', verifier: 'ver', redirect: 'https://app/' } }); assert.equal(r.code, 401)
  r = await call(importer, { ...H('x'), body: { action: 'lichess_oauth', code: 'goodcode', verifier: 'ver', redirect: 'https://app/' } })
  assert.equal(r.code, 200); assert.equal(r.body.raw, 1600); assert.equal(store.get('users/userCCCCCC').imported.username, 'cara')
  assert.ok(tokenCalls.includes('DELETE')) // token revoked right away
  deps.fetch = realFetch
  console.log('lichess oauth tests passed')
}
