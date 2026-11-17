import { onChange } from './store.js'
const USERS = 'fakeauth.users'
const me = () => { try { return JSON.parse(sessionStorage.getItem('fakeauth.me') || 'null') } catch { return null } }
const setMe = (u) => { u ? sessionStorage.setItem('fakeauth.me', JSON.stringify(u)) : sessionStorage.removeItem('fakeauth.me'); subs.forEach((f) => f(me())) }
const subs = new Set()
export const getAuth = () => ({ get currentUser() { const u = me(); return u && { ...u, getIdToken: async () => 'tok-' + u.uid } } })
export const onAuthStateChanged = (_a, cb) => { subs.add(cb); setTimeout(() => cb(me()), 0); return () => subs.delete(cb) }
export class GoogleAuthProvider {}
const rnd = () => 'u' + Math.random().toString(36).slice(2, 10)
export const signInAnonymously = async () => { const u = { uid: rnd(), isAnonymous: true, displayName: null, email: null }; setMe(u); return { user: u } }
export const signInWithPopup = async () => { const u = { uid: rnd(), isAnonymous: false, displayName: 'Google Tester', email: 'g@test.dev' }; setMe(u); return { user: u } }
const users = () => JSON.parse(localStorage.getItem(USERS) || '{}')
export const createUserWithEmailAndPassword = async (_a, email, pw) => {
  const all = users(); if (all[email]) { const e = new Error('auth/email-already-in-use'); e.code = 'auth/email-already-in-use'; throw e }
  const u = { uid: rnd(), isAnonymous: false, displayName: null, email }; all[email] = { pw, u }; localStorage.setItem(USERS, JSON.stringify(all)); setMe(u); return { user: u }
}
export const updateProfile = async (u, p) => { const cur = me(); if (cur) { setMe({ ...cur, ...p }) } }
export const signInWithEmailAndPassword = async (_a, email, pw) => {
  const r = users()[email]; if (!r || r.pw !== pw) { const e = new Error('auth/invalid-credential'); e.code = 'auth/invalid-credential'; throw e }
  setMe(r.u); return { user: r.u }
}
export const signOut = async () => setMe(null)
export const sendPasswordResetEmail = async () => {}
