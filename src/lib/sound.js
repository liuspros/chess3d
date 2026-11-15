// Fully synthesised sound effects (no audio files = tiny, works offline).

let ctx = null
let muted = false

function ac() {
  if (muted) return null
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function setMuted(v) {
  muted = v
}

function noiseBuffer(c, dur) {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  return buf
}

// wooden "tock": filtered noise click + short low thump
function tock(c, t, { freq = 900, thump = 170, gain = 0.5, dur = 0.09 } = {}) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, dur)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 1.2
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(bp).connect(g).connect(c.destination)
  src.start(t)

  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(thump, t)
  o.frequency.exponentialRampToValueAtTime(thump * 0.55, t + 0.1)
  const og = c.createGain()
  og.gain.setValueAtTime(gain * 0.9, t)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  o.connect(og).connect(c.destination)
  o.start(t)
  o.stop(t + 0.14)
}

function tone(c, t, freq, dur = 0.18, gain = 0.15, type = 'sine') {
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export function play(name) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + 0.005
  switch (name) {
    case 'move':
      tock(c, t)
      break
    case 'capture':
      tock(c, t, { freq: 650, thump: 120, gain: 0.8, dur: 0.14 })
      tock(c, t + 0.06, { freq: 1100, thump: 200, gain: 0.35, dur: 0.07 })
      break
    case 'castle':
      tock(c, t)
      tock(c, t + 0.13, { freq: 1000, thump: 190 })
      break
    case 'check':
      tock(c, t)
      tone(c, t + 0.08, 880, 0.14, 0.12)
      tone(c, t + 0.2, 660, 0.2, 0.12)
      break
    case 'promote':
      tock(c, t)
      ;[520, 660, 880].forEach((f, i) => tone(c, t + 0.06 + i * 0.07, f, 0.16, 0.1, 'triangle'))
      break
    case 'select':
      tone(c, t, 1200, 0.04, 0.04, 'triangle')
      break
    case 'mate':
      tock(c, t, { freq: 600, thump: 100, gain: 0.9, dur: 0.16 })
      ;[392, 494, 587, 784].forEach((f, i) => tone(c, t + 0.15 + i * 0.12, f, 0.7, 0.1, 'triangle'))
      break
    case 'draw':
      ;[440, 392].forEach((f, i) => tone(c, t + i * 0.18, f, 0.5, 0.1, 'triangle'))
      break
    case 'start':
      ;[330, 440, 523].forEach((f, i) => tone(c, t + i * 0.08, f, 0.3, 0.08, 'triangle'))
      break
    case 'error':
      tone(c, t, 180, 0.12, 0.1, 'square')
      break
    default:
  }
}

export function haptic(ms = 12) {
  if (!muted && navigator.vibrate) {
    try {
      navigator.vibrate(ms)
    } catch {
      /* ignore */
    }
  }
}
