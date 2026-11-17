import { SERVER_TS, rawGet, rawSet, rawUpdate, rawDelete, rawList, onChange, wrapTs } from './store.js'
export const getFirestore = () => ({})
export const serverTimestamp = () => SERVER_TS
const P = (...a) => a.filter((x) => typeof x === 'string').join('/')
export const doc = (_db, ...p) => ({ path: P(...p), kind: 'doc', id: p[p.length - 1] })
export const collection = (_db, ...p) => ({ path: P(...p), kind: 'col' })
const mkSnap = (path) => {
  const d = rawGet(path)
  return { id: path.split('/').pop(), exists: () => d != null, data: () => (d == null ? undefined : wrapTs(d)) }
}
export const getDoc = async (ref) => mkSnap(ref.path)
export const setDoc = async (ref, data) => rawSet(ref.path, data)
export const updateDoc = async (ref, patch) => rawUpdate(ref.path, patch)
export const deleteDoc = async (ref) => rawDelete(ref.path)
export const addDoc = async (col, data) => { const id = Math.random().toString(36).slice(2, 12); rawSet(col.path + '/' + id, data); return { id } }
export const where = (f, op, v) => ({ t: 'where', f, op, v })
export const orderBy = (f, dir = 'asc') => ({ t: 'order', f, dir })
export const limit = (n) => ({ t: 'limit', n })
export const query = (col, ...c) => ({ ...col, c })
const get = (o, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
const num = (v) => (v && typeof v === 'object' && '__t' in v ? v.__t : v)
export const getDocs = async (q) => {
  let rows = rawList(q.path)
  for (const c of q.c || []) if (c.t === 'where') rows = rows.filter(([, d]) => c.op === '==' ? get(d, c.f) === c.v : true)
  const ord = (q.c || []).find((c) => c.t === 'order')
  if (ord) rows.sort((a, b) => (num(get(a[1], ord.f)) > num(get(b[1], ord.f)) ? 1 : -1) * (ord.dir === 'desc' ? -1 : 1))
  const lim = (q.c || []).find((c) => c.t === 'limit')
  if (lim) rows = rows.slice(0, lim.n)
  return { docs: rows.map(([p]) => mkSnap(p)) }
}
export const onSnapshot = (ref, cb) => {
  let last = null
  if (ref.kind === 'col') {
    const runC = async () => { const r = await getDocs(ref); const s = JSON.stringify(r.docs.map((d) => [d.id, d.data()])); if (s === last) return; last = s; cb(r) }
    const offC = onChange(runC)
    setTimeout(runC, 0)
    return offC
  }
  const run = () => { const s = JSON.stringify(rawGet(ref.path) ?? null); if (s === last) return; last = s; cb(mkSnap(ref.path)) }
  const off = onChange(run)
  setTimeout(run, 0)
  return off
}
export const runTransaction = async (_db, fn) => {
  const tx = {
    get: async (ref) => mkSnap(ref.path),
    set: (ref, d) => rawSet(ref.path, d),
    update: (ref, p) => rawUpdate(ref.path, p),
  }
  return fn(tx)
}
