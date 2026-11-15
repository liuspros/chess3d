import { TIERS } from '../three/materials.js'

// Picks a graphics tier from device hints. Budget Android phones get "low"
// by default; the app also steps down automatically if the frame rate drops.
export function detectTier() {
  let gpu = ''
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return 'none'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    return 'none'
  }

  const ua = navigator.userAgent || ''
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const mem = navigator.deviceMemory || 4
  const cores = navigator.hardwareConcurrency || 4

  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'low'

  if (mobile) {
    if (/Apple/i.test(gpu) || /iPhone|iPad/i.test(ua)) return 'medium'
    if (mem >= 6 && cores >= 8 && /Adreno\s?(6[5-9]|[7-9]\d\d)|Mali-G(7[0-9]|[89]\d)/i.test(gpu)) return 'medium'
    return 'low'
  }

  if (mem <= 2) return 'low'
  if (/NVIDIA|GeForce|RTX|GTX|Radeon|AMD|Apple M/i.test(gpu)) return 'high'
  return 'medium'
}

export const ORDER = ['high', 'medium', 'low']

export function stepDown(name) {
  const i = ORDER.indexOf(name)
  return ORDER[Math.min(ORDER.length - 1, i + 1)]
}

export function resolveTier(pref, autoName) {
  if (pref === 'auto') return TIERS[autoName] || TIERS.low
  return TIERS[pref] || TIERS.low
}
