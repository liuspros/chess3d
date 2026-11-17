// Brings games from Lichess / Chess.com (or any PGN file) into the app.
// Runs in the browser: both sites allow CORS on their public APIs. Requests are spaced ~1/s,
// 429 answers are waited out, and everything arrives in batches so the screen updates while
// a big archive is still downloading.
import { Chess } from 'chess.js'

export const IMPORT_KEY = 'chess3d.imported.v1'
export const MAX_STORED = 300

const sleep = (ms, signal) =>
  new Promise((res, rej) => {
    const t = setTimeout(res, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      rej(new DOMException('Aborted', 'AbortError'))
    })
  })

export function loadImported() {
  try {
    return JSON.parse(localStorage.getItem(IMPORT_KEY) || '[]')
  } catch {
    return []
  }
}
export function saveImported(list) {
  try {
    localStorage.setItem(IMPORT_KEY, JSON.stringify(list.slice(0, MAX_STORED)))
  } catch {
    /* storage full or blocked */
  }
}
export function mergeImported(prev, add) {
  const seen = new Set(prev.map((g) => g.id))
  const fresh = add.filter((g) => !seen.has(g.id))
  return [...fresh, ...prev].sort((a, b) => b.at - a.at).slice(0, MAX_STORED)
}

/* ------------------------------ PGN ------------------------------ */
export function splitPgn(text) {
  const t = String(text || '').replace(/\r/g, '').trim()
  if (!t) return []
  return t.split(/\n\s*\n(?=\[Event )/).map((s) => s.trim()).filter(Boolean)
}

const dateMs = (h) => {
  const d = (h.UTCDate || h.Date || '').replace(/\./g, '-')
  const t = h.UTCTime || h.EndTime || '00:00:00'
  const ms = Date.parse(`${d}T${t}Z`)
  return Number.isFinite(ms) ? ms : Date.now()
}

// me: the player's username on that site (to work out colour and result); optional for plain files
export function parseGame(pgn, me, src = 'pgn') {
  const c = new Chess()
  try {
    c.loadPgn(pgn)
  } catch {
    return null
  }
  const h = c.header()
  const hist = c.history({ verbose: true })
  if (!hist.length) return null
  const moves = hist.map((m) => m.from + m.to + (m.promotion || ''))
  const lme = (me || '').toLowerCase()
  let color = 'w'
  if (lme && (h.Black || '').toLowerCase() === lme) color = 'b'
  const res = h.Result
  let result = 'draw'
  if (res === '1-0') result = color === 'w' ? 'win' : 'loss'
  else if (res === '0-1') result = color === 'b' ? 'win' : 'loss'
  else if (res !== '1/2-1/2') result = 'draw'
  const opp = color === 'w' ? h.Black : h.White
  const site = h.Link || h.Site || ''
  const id = `${src}:${site || `${h.White}-${h.Black}-${h.UTCDate || h.Date}-${h.UTCTime || ''}-${moves.length}`}`
  return {
    id,
    mode: 'import',
    src,
    opp: opp || 'Opponent',
    oppRating: Number(color === 'w' ? h.BlackElo : h.WhiteElo) || null,
    myRating: Number(color === 'w' ? h.WhiteElo : h.BlackElo) || null,
    color,
    result,
    reason: (h.Termination || (res === '1/2-1/2' ? 'draw' : 'game')).toLowerCase(),
    tc: h.TimeControl || '',
    moves,
    at: dateMs(h),
  }
}

export async function parsePgnText(text, me, src = 'pgn', onProgress) {
  const parts = splitPgn(text)
  const out = []
  for (let i = 0; i < parts.length; i++) {
    const g = parseGame(parts[i], me, src)
    if (g) out.push(g)
    if (i % 20 === 19) {
      onProgress?.(i + 1, parts.length)
      await new Promise((r) => setTimeout(r)) // let the page breathe on large files
    }
  }
  return out
}

/* ------------------------------ fetching ------------------------------ */
// GET with 429 handling: wait (Retry-After, or 60 s as Lichess asks) then retry a few times.
export async function politeFetch(url, init = {}, { signal, onWait, tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { ...init, signal })
    if (r.status !== 429) return r
    const ra = Number(r.headers.get('Retry-After'))
    const wait = (Number.isFinite(ra) && ra > 0 ? ra : 60) * 1000
    onWait?.(Math.round(wait / 1000))
    await sleep(wait, signal)
  }
  const e = new Error('The site is rate-limiting us. Try again in a few minutes.')
  e.rateLimited = true
  throw e
}

// Lichess: one streamed export, newest first.
export async function importLichess(username, { max = 100, perfType = 'rapid,blitz,classical', since, signal, onProgress, onWait } = {}) {
  const q = new URLSearchParams({ max: String(max), moves: 'true', tags: 'true', clocks: 'false', evals: 'false', opening: 'false', perfType })
  if (since) q.set('since', String(since))
  onProgress?.({ phase: 'download', done: 0 })
  const r = await politeFetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${q}`, { headers: { Accept: 'application/x-chess-pgn' } }, { signal, onWait })
  if (r.status === 404) throw new Error('That Lichess user was not found.')
  if (!r.ok) throw new Error('Lichess did not answer. Try again.')
  const text = await r.text()
  const games = await parsePgnText(text, username, 'lichess', (d, t) => onProgress?.({ phase: 'parse', done: d, total: t }))
  onProgress?.({ phase: 'done', done: games.length })
  return games
}

// Chess.com: list of monthly archives, newest first, one request per month spaced ~1 s apart.
export async function importChesscom(username, { max = 100, signal, onBatch, onProgress, onWait } = {}) {
  const u = encodeURIComponent(username.toLowerCase())
  const ar = await politeFetch(`https://api.chess.com/pub/player/${u}/games/archives`, {}, { signal, onWait })
  if (ar.status === 404) throw new Error('That Chess.com user was not found.')
  if (!ar.ok) throw new Error('Chess.com did not answer. Try again.')
  const months = [...((await ar.json()).archives || [])].reverse()
  const out = []
  for (let i = 0; i < months.length && out.length < max; i++) {
    await sleep(1000, signal)
    onProgress?.({ phase: 'download', done: out.length, month: i + 1, months: months.length })
    const r = await politeFetch(months[i], {}, { signal, onWait })
    if (!r.ok) continue
    const j = await r.json()
    const batch = []
    for (const g of [...(j.games || [])].reverse()) {
      if (!g.pgn || (g.rules && g.rules !== 'chess')) continue
      const rec = parseGame(g.pgn, username, 'chesscom')
      if (rec) batch.push(rec)
      if (out.length + batch.length >= max) break
    }
    out.push(...batch)
    onBatch?.(batch)
  }
  onProgress?.({ phase: 'done', done: out.length })
  return out
}
