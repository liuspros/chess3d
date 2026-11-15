// Tiny Firestore/Auth stand-in for tests: localStorage + BroadcastChannel, shared between tabs.
const KEY = 'fakefs.v1'
const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fakefs') : null
const listeners = new Set()
export const SERVER_TS = { __server: true }
const stamp = (v) => (v && v.__server ? { __t: Date.now() } : v)

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); ch?.postMessage(1); fire() }
function fire() { listeners.forEach((f) => f()) }
if (ch) ch.onmessage = () => fire()

export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f) }

function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)) }
function resolve(obj) {
  if (obj && typeof obj === 'object') {
    if (obj.__server) return { __t: Date.now() }
    if (Array.isArray(obj)) return obj.map(resolve)
    const o = {}
    for (const k of Object.keys(obj)) o[k] = resolve(obj[k])
    return o
  }
  return obj
}
function wrapTs(obj) {
  if (obj && typeof obj === 'object') {
    if ('__t' in obj && Object.keys(obj).length === 1) return { toMillis: () => obj.__t, __t: obj.__t }
    if (Array.isArray(obj)) return obj.map(wrapTs)
    const o = {}
    for (const k of Object.keys(obj)) o[k] = wrapTs(obj[k])
    return o
  }
  return obj
}
function setPath(o, path, v) {
  const parts = path.split('.')
  let cur = o
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = cur[parts[i]] && typeof cur[parts[i]] === 'object' ? cur[parts[i]] : {}; cur = cur[parts[i]] }
  cur[parts[parts.length - 1]] = v
}

export const rawGet = (path) => clone(load()[path])
export function rawSet(path, data) { const db = load(); db[path] = clone(resolve(data)); save(db) }
export function rawUpdate(path, patch) {
  const db = load()
  if (!db[path]) throw new Error('No document to update: ' + path)
  const r = resolve(patch)
  for (const k of Object.keys(r)) setPath(db[path], k, r[k])
  save(db)
}
export function rawDelete(path) { const db = load(); delete db[path]; save(db) }
export function rawList(prefix) {
  const db = load()
  const depth = prefix.split('/').length + 1
  return Object.keys(db).filter((p) => p.startsWith(prefix + '/') && p.split('/').length === depth).map((p) => [p, clone(db[p])])
}
export { wrapTs }
