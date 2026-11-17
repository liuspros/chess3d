import { PIECE_H } from '../pieceGeometry.js'
import { squarePos } from '../coords.js'

/* ------------------------------------------------------------------ *
 *  Choreography of a chess move.
 *  u runs 0 → TOTAL through: reach · descend · grip · lift · move ·
 *  lower · release · rise · return. poseAt(u) gives the hand target
 *  (position, curl, and the height of the carried piece).
 * ------------------------------------------------------------------ */

export const GRIP_FRAC = 0.78
export const TOTAL = 2.7
export const REST = {
  w: { x: 5.0, y: 0.7, z: 6.3 },
  b: { x: -5.0, y: 0.7, z: -6.3 },
}
export const SHOULDER = { w: [2, 15], b: [-2, -15] }
export const REST_CURL = 0.15

// minimum-jerk easing: zero velocity AND acceleration at both ends, so hands never snap
export const ease = (k) => k * k * k * (k * (k * 6 - 15) + 10)
export const lerp = (a, b, t) => a + (b - a) * t
export const seg = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)))

export function planStep(step, reg, captureId) {
  const [sx, , sz] = squarePos(step.from)
  const [tx, , tz] = squarePos(step.to)
  const h = PIECE_H[step.type] || 1
  const gripY = h * GRIP_FRAC
  // is the straight path blocked by another piece?
  let blocked = false
  reg.forEach((api, id) => {
    if (id === step.pieceId || id === captureId) return
    const p = api.group.position
    if (p.y > 0.4) return
    for (let i = 1; i < 12; i++) {
      const t = i / 12
      const x = lerp(sx, tx, t)
      const z = lerp(sz, tz, t)
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.5) blocked = true
    }
  })
  const lift = step.type === 'n' ? 1.25 : blocked ? 1.75 : 0.45
  return { sx, sz, tx, tz, gripY, lift }
}

export function poseAt(u, plan, side) {
  const { sx, sz, tx, tz, gripY, lift } = plan
  const R = REST[side]
  const hoverY = gripY + 1.3
  let gx, gy, gz, curl, base
  if (u < 0.45) {
    // reach: the hand travels in a shallow arc, opening as it goes
    const k = ease(seg(u, 0, 0.45))
    gx = lerp(R.x, sx, k)
    gz = lerp(R.z, sz, k)
    gy = lerp(R.y, hoverY, k) + Math.sin(Math.PI * k) * 0.35
    curl = lerp(REST_CURL, 0.04, ease(seg(u, 0, 0.3)))
    base = 0
  } else if (u < 0.75) {
    const k = ease(seg(u, 0.45, 0.75))
    gx = sx
    gz = sz
    gy = lerp(hoverY, gripY, k)
    curl = 0.04
    base = 0
  } else if (u < 0.9) {
    // grip: fingers wrap the piece
    const k = ease(seg(u, 0.75, 0.9))
    gx = sx
    gz = sz
    gy = gripY
    curl = lerp(0.04, 1, k)
    base = 0
  } else if (u < 1.1) {
    const k = ease(seg(u, 0.9, 1.1))
    gx = sx
    gz = sz
    base = lift * k
    gy = gripY + base
    curl = 1
  } else if (u < 1.6) {
    const k = ease(seg(u, 1.1, 1.6))
    gx = lerp(sx, tx, k)
    gz = lerp(sz, tz, k)
    base = lift + 0.12 * Math.sin(Math.PI * k)
    gy = gripY + base
    curl = 1
  } else if (u < 1.8) {
    const k = ease(seg(u, 1.6, 1.8))
    gx = tx
    gz = tz
    base = lift * (1 - k)
    gy = gripY + base
    curl = 1
  } else if (u < 1.95) {
    // release: fingers open one after the other
    const k = ease(seg(u, 1.8, 1.95))
    gx = tx
    gz = tz
    gy = gripY
    curl = lerp(1, 0.04, k)
    base = 0
  } else if (u < 2.2) {
    const k = ease(seg(u, 1.95, 2.2))
    gx = tx
    gz = tz
    gy = lerp(gripY, hoverY, k)
    curl = 0.04
    base = 0
  } else {
    // return: relax towards the resting position
    const k = ease(seg(u, 2.2, TOTAL))
    gx = lerp(tx, R.x, k)
    gz = lerp(tz, R.z, k)
    gy = lerp(hoverY, R.y, k) + Math.sin(Math.PI * k) * 0.2
    curl = lerp(0.04, REST_CURL, k)
    base = 0
  }
  return { gx, gy, gz, curl, base }
}
