import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../firebase/api.js'

// Auth + profile. Firebase is only loaded once the person opens an online feature
// (or was signed in before — remembered in localStorage).
export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('chess3d.fb') === '1'
    } catch {
      return false
    }
  })
  const nameRef = useRef(null)

  const enable = useCallback(() => {
    setEnabled(true)
    try {
      localStorage.setItem('chess3d.fb', '1')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setReady(true)
      return
    }
    let off = null
    let dead = false
    api.onAuth(async (u) => {
      if (dead) return
      setUser(u)
      if (!u) {
        setProfile(null)
        setReady(true)
        return
      }
      try {
        const p = await api.ensureProfile(u, nameRef.current)
        nameRef.current = null
        if (dead) return
        setProfile(p)
        api.calibrate(u.uid).catch(() => {})
      } catch (e) {
        setError(e.message)
      }
      setReady(true)
    }).then((o) => (off = o))
    return () => {
      dead = true
      off?.()
    }
  }, [enabled])

  const wrap = useCallback(
    (fn) =>
      async (...a) => {
        enable()
        setBusy(true)
        setError(null)
        try {
          return await fn(...a)
        } catch (e) {
          const msg = {
            'auth/invalid-credential': 'Wrong email or password.',
            'auth/email-already-in-use': 'That email already has an account. Try signing in.',
            'auth/weak-password': 'Password needs at least 6 characters.',
            'auth/invalid-email': 'That email does not look right.',
            'auth/popup-closed-by-user': null,
            'auth/cancelled-popup-request': null,
            'auth/operation-not-allowed': 'This sign-in method is not switched on in Firebase yet.',
          }[e.code]
          setError(msg === undefined ? e.message : msg)
        } finally {
          setBusy(false)
        }
      },
    [enable],
  )

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const p = await api.getProfile(user.uid)
    if (p) setProfile(p)
  }, [user])

  return {
    user,
    profile,
    ready,
    busy,
    error,
    setError,
    enabled,
    enable,
    refreshProfile,
    google: wrap(() => api.signInGoogle()),
    signUp: wrap((email, pw, name) => {
      nameRef.current = name
      return api.signUpEmail(email, pw, name)
    }),
    signIn: wrap((email, pw) => api.signInEmail(email, pw)),
    guest: wrap(() => api.signInGuest()),
    signOut: wrap(async () => {
      await api.signOutUser()
      setProfile(null)
    }),
    rename: async (n) => {
      await api.renameUser(user.uid, n)
      setProfile((p) => ({ ...p, name: n }))
    },
  }
}
