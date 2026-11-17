import crypto from 'node:crypto'
import { convertPuzzle, initialRd, pickRating, PROVISIONAL_GAMES } from '../src/lib/ratingConvert.js'
import { deps, getDb, httpError, readJson, send, serverTs, verifyBearer, wrap } from './_lib.js'

// POST /api/import { action: 'start', platform, username }  -> { code }
// POST /api/import { action: 'verify' }                     -> { rating, puzzleRating, ... }
// Ownership is proved by putting a one-time code in the public profile (Lichess bio / Chess.com location).
const CODE_TTL = 30 * 60 * 1000
const NAME_RE = /^[A-Za-z0-9_-]{2,30}$/

const ua = () => `Chess3D-Import/1.0 (contact: ${deps.env('IMPORT_CONTACT_EMAIL') || 'set IMPORT_CONTACT_EMAIL'})`

async function getJson(url) {
  const r = await deps.fetch(url, { headers: { 'User-Agent': ua(), Accept: 'application/json' } })
  if (r.status === 404) throw httpError(404, 'That username was not found.')
  if (r.status === 429) throw httpError(429, 'The chess site is busy. Try again in a minute.')
  if (!r.ok) throw httpError(502, 'Could not reach the chess site. Try again.')
  return r.json()
}

export async function fetchProfile(platform, username) {
  if (platform === 'lichess') {
    const j = await getJson(`https://lichess.org/api/user/${encodeURIComponent(username)}`)
    if (j.closed || j.disabled) throw httpError(400, 'That account is closed.')
    const p = j.perfs || {}
    const list = ['rapid', 'classical', 'blitz', 'bullet'].map((k) => ({ kind: k, rating: p[k]?.rating, games: p[k]?.games || 0 }))
    // provisional Lichess ratings (prov flag) are not trusted
    ;['rapid', 'classical', 'blitz', 'bullet'].forEach((k, i) => p[k]?.prov && (list[i].games = Math.min(list[i].games, 5)))
    return { text: `${j.profile?.bio || ''}\n${j.profile?.location || ''}`, list, puzzle: p.puzzle?.rating || null, canonical: String(j.username || j.id || username).toLowerCase() }
  }
  const [prof, stats] = await Promise.all([
    getJson(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`),
    getJson(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`),
  ])
  const rec = (s) => (s?.record ? (s.record.win || 0) + (s.record.loss || 0) + (s.record.draw || 0) : 0)
  const list = [
    ['rapid', stats.chess_rapid],
    ['blitz', stats.chess_blitz],
    ['bullet', stats.chess_bullet],
    ['daily', stats.chess_daily],
  ].map(([kind, s]) => ({ kind, rating: s?.last?.rating, games: rec(s) }))
  return {
    text: `${prof.location || ''}\n${prof.name || ''}`,
    list,
    puzzle: stats.tactics?.highest?.rating || stats.tactics?.lowest?.rating || null,
    canonical: String(prof.username || username).toLowerCase(),
  }
}

export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw httpError(405, 'POST only')
  const user = await verifyBearer(req)
  const body = await readJson(req)
  const db = await getDb()
  const uref = db.collection('users').doc(user.uid)
  const us = await uref.get()
  if (!us.exists) throw httpError(403, 'Create your profile first.')
  if (us.data().guest) throw httpError(403, 'Sign in with an account to import ratings.')
  if (us.data().imported) throw httpError(409, 'You already imported a rating.')
  const iref = db.collection('imports').doc(user.uid)

  if (body.action === 'start') {
    const platform = body.platform
    const username = String(body.username || '').trim()
    if (platform !== 'lichess' && platform !== 'chesscom') throw httpError(400, 'Pick Lichess or Chess.com.')
    if (!NAME_RE.test(username)) throw httpError(400, 'That does not look like a username.')
    // same account within the window keeps the same code, so one already pasted on the profile stays valid
    const prev = await iref.get()
    const pd = prev.exists ? prev.data() : null
    const reuse = pd && pd.platform === platform && pd.username === username.toLowerCase() && Date.now() - pd.at < CODE_TTL
    const code = reuse ? pd.code : `MIGRATE-${crypto.randomInt(1000, 10000)}`
    if (!reuse) await iref.set({ platform, username: username.toLowerCase(), code, at: Date.now() })
    return send(res, 200, { code, platform, username, where: platform === 'lichess' ? 'bio' : 'location' })
  }

  if (body.action === 'verify') {
    const s = await iref.get()
    if (!s.exists) throw httpError(400, 'Start the import first.')
    const { platform, username, code, at } = s.data()
    if (Date.now() - at > CODE_TTL) throw httpError(410, 'That code expired. Start again.')
    const prof = await fetchProfile(platform, username)
    if (!prof.text.includes(code)) {
      const seen = prof.text.replace(/\s+/g, ' ').trim().slice(0, 60)
      throw httpError(422, `Could not find ${code} on your ${platform === 'lichess' ? 'Lichess bio' : 'Chess.com location or name'}. We read: ${seen ? `"${seen}"` : 'nothing there'}. Save it, wait a minute (Chess.com updates slowly), and try again.`)
    }
    const claimRef = db.collection('importClaims').doc(`${platform}_${prof.canonical}`)
    const claim = await claimRef.get()
    if (claim.exists && claim.data().uid !== user.uid) throw httpError(409, 'That account is already linked to another player.')
    const picked = pickRating(platform, prof.list)
    if (!picked) throw httpError(422, 'No rated games found on that account.')
    const puzzleRating = convertPuzzle(platform, prof.puzzle)
    const rd = Math.round(initialRd(platform, picked.games))
    const ts = await serverTs()
    await claimRef.set({ uid: user.uid, at: ts })
    await uref.update({
      rating: picked.rating,
      provisional: PROVISIONAL_GAMES,
      rd,
      imported: { platform, username: prof.canonical, raw: picked.raw, kind: picked.kind, games: picked.games, puzzle: puzzleRating, at: ts },
    })
    return send(res, 200, { rating: picked.rating, raw: picked.raw, kind: picked.kind, games: picked.games, puzzleRating, rd, provisional: PROVISIONAL_GAMES })
  }
  throw httpError(400, 'Unknown action')
})
