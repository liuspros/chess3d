// Run: node test/import.test.mjs   (PGN parsing + importers with a faked fetch)
import assert from 'node:assert/strict'
import { parseGame, parsePgnText, splitPgn, importChesscom, importLichess } from '../src/lib/importers.js'
const pgn = (w, b, res, id) => `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.01"]
[White "${w}"]
[Black "${b}"]
[Result "${res}"]
[WhiteElo "1500"]
[BlackElo "1450"]
[Link "https://www.chess.com/game/live/${id}"]
[Termination "${w} won by checkmate"]

1. f3 e5 2. g4 Qh4# ${res}
`
const two = pgn('amy', 'me', '0-1', 1) + '\n' + pgn('me', 'bob', '0-1', 2)
assert.equal(splitPgn(two).length, 2)
const g = parseGame(pgn('amy', 'me', '0-1', 1), 'Me', 'chesscom')
assert.equal(g.color, 'b'); assert.equal(g.result, 'win'); assert.deepEqual(g.moves, ['f2f3', 'e7e5', 'g2g4', 'd8h4']); assert.equal(g.oppRating, 1500); assert.equal(g.opp, 'amy')
const all = await parsePgnText(two, 'me', 'pgn')
assert.deepEqual(all.map((x) => x.result), ['win', 'loss'])
assert.equal(parseGame('garbage', 'me'), null)

// chess.com: monthly archives newest first, one request per month, 429 retried
let hits = []
let limited = true
globalThis.fetch = async (url) => {
  hits.push(url)
  const res = (b, status = 200, h = {}) => ({ ok: status < 400, status, headers: { get: (k) => h[k] ?? null }, json: async () => b, text: async () => '' })
  if (url.endsWith('/games/archives')) return res({ archives: ['https://api.chess.com/pub/player/me/games/2026/09', 'https://api.chess.com/pub/player/me/games/2026/10'] })
  if (url.endsWith('/2026/10')) {
    if (limited) { limited = false; return res({}, 429, { 'Retry-After': '0.01' }) }
    return res({ games: [{ pgn: pgn('amy', 'me', '0-1', 11), rules: 'chess' }, { pgn: pgn('x', 'y', '1-0', 12), rules: 'chess960' }] })
  }
  return res({ games: [{ pgn: pgn('me', 'bob', '1-0', 21), rules: 'chess' }] })
}
const batches = []
const list = await importChesscom('Me', { max: 100, onBatch: (b) => batches.push(b.length) })
assert.equal(list.length, 2); assert.deepEqual(batches, [1, 1]); assert.ok(hits.indexOf(hits.find((h) => h.endsWith('/2026/10'))) < hits.indexOf(hits.find((h) => h.endsWith('/2026/09')))) // newest first
const capped = await importChesscom('me', { max: 1 }); assert.equal(capped.length, 1)

globalThis.fetch = async (url, init) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => { assert.match(init.headers.Accept, /pgn/); assert.match(url, /max=5/); return pgn('me', 'bob', '1-0', 5) } })
assert.equal((await importLichess('me', { max: 5 })).length, 1)
console.log('import parse tests passed')
