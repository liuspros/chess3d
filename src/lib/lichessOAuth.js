// "Continue with Lichess": OAuth2 authorization code + PKCE. Lichess needs no app registration
// and no secret; with no scope requested the token can only read the account name.
const CLIENT_ID = 'chess3d'
const KEY = 'chess3d.lichess.pkce'
const PENDING = 'chess3d.lichess.pending'
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)))

export async function startLichessLogin() {
  const verifier = rand(48)
  const state = rand(16)
  const redirect = location.origin + '/'
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem(KEY, JSON.stringify({ verifier, state, redirect }))
  const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: redirect, code_challenge_method: 'S256', code_challenge: challenge, state })
  location.assign(`https://lichess.org/oauth?${q}`)
}

// Call once on page load: picks up ?code=&state= after Lichess sends the person back.
export function takeLichessCallback() {
  try {
    const u = new URL(location.href)
    const code = u.searchParams.get('code')
    const state = u.searchParams.get('state')
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (!saved || !state || state !== saved.state) return false
    u.searchParams.delete('code')
    u.searchParams.delete('state')
    u.searchParams.delete('error')
    u.searchParams.delete('error_description')
    history.replaceState(null, '', u.pathname + u.search)
    sessionStorage.removeItem(KEY)
    if (!code) return 'denied'
    sessionStorage.setItem(PENDING, JSON.stringify({ code, verifier: saved.verifier, redirect: saved.redirect }))
    return 'ok'
  } catch {
    return false
  }
}

export function pendingLichess() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING) || 'null')
  } catch {
    return null
  }
}
export const clearPendingLichess = () => {
  try {
    sessionStorage.removeItem(PENDING)
  } catch {
    /* ignore */
  }
}
