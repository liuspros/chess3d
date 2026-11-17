import { getIdToken } from '../firebase/api.js'

const BASE = import.meta.env.VITE_API_BASE || ''

async function call(path, { method = 'GET', body, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers.Authorization = 'Bearer ' + (await getIdToken())
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Could not reach the shop. Check your connection.')
  return j
}

export const getQuote = (items) => call('/api/quote?items=' + encodeURIComponent(items.join(',')))
export const startCheckout = (items) => call('/api/checkout', { method: 'POST', body: { items }, auth: true })
export const verifyPayment = (reference) => call('/api/verify', { method: 'POST', body: { reference }, auth: true })

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: currency === 'USD' ? 2 : 0 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}
