/* ------------------------------------------------------------------ *
 *  Hand poses (radians). A pose is a plain object so poses can be
 *  blended, layered and stored. Flexion is positive towards the palm.
 *
 *    f[i] = { mcp, pip, dip, spread }   index, middle, ring, pinky
 *    t    = { abd, flex, roll, mcp, ip }   thumb (CMC abduction/flexion/opposition)
 *    w    = { flex, dev, roll }           wrist (relative to the forearm)
 * ------------------------------------------------------------------ */

export const LIMITS = {
  mcp: [-0.45, 1.6],
  pip: [0, 1.85],
  dip: [0, 1.4],
  spread: [-0.35, 0.35],
  tAbd: [-0.9, 0.5],
  tFlex: [-0.4, 0.9],
  tRoll: [-0.5, 1.0],
  tMcp: [-0.2, 1.2],
  tIp: [-0.3, 1.3],
  wFlex: [-0.9, 0.9],
  wDev: [-0.4, 0.45],
  wRoll: [-0.6, 0.6],
}

// a relaxed, slightly curled hand: what a person's hand does when it hovers
export const POSE_REST = {
  f: [
    { mcp: 0.16, pip: 0.2, dip: 0.1, spread: 0 },
    { mcp: 0.2, pip: 0.26, dip: 0.12, spread: 0 },
    { mcp: 0.26, pip: 0.32, dip: 0.16, spread: 0 },
    { mcp: 0.32, pip: 0.4, dip: 0.2, spread: 0 },
  ],
  t: { abd: -0.02, flex: 0.06, roll: 0, mcp: 0.14, ip: 0.1 },
  w: { flex: -0.04, dev: 0, roll: 0 },
}

// open, ready to descend onto a piece
export const POSE_OPEN = {
  f: [
    { mcp: 0.06, pip: 0.08, dip: 0.04, spread: -0.06 },
    { mcp: 0.08, pip: 0.1, dip: 0.04, spread: -0.01 },
    { mcp: 0.1, pip: 0.12, dip: 0.06, spread: 0.05 },
    { mcp: 0.1, pip: 0.14, dip: 0.08, spread: 0.12 },
  ],
  t: { abd: -0.2, flex: 0.0, roll: -0.05, mcp: 0.04, ip: 0.04 },
  w: { flex: -0.1, dev: 0, roll: 0 },
}

// pinch around a piece: thumb opposes index and middle, ring + pinky tuck in
export const POSE_GRIP = {
  f: [
    { mcp: 0.7, pip: 0.8, dip: 0.4, spread: 0.05 },
    { mcp: 0.78, pip: 0.9, dip: 0.45, spread: 0.0 },
    { mcp: 0.95, pip: 1.1, dip: 0.55, spread: -0.02 },
    { mcp: 1.05, pip: 1.2, dip: 0.6, spread: -0.04 },
  ],
  t: { abd: 0.2, flex: 0.35, roll: 0.45, mcp: 0.4, ip: 0.3 },
  w: { flex: 0.1, dev: 0, roll: 0 },
}

const lerp = (a, b, t) => a + (b - a) * t
export const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))

export function blendPose(a, b, t, out = clonePose(a)) {
  for (let i = 0; i < 4; i++) for (const k in a.f[i]) out.f[i][k] = lerp(a.f[i][k], b.f[i][k], t)
  for (const k in a.t) out.t[k] = lerp(a.t[k], b.t[k], t)
  for (const k in a.w) out.w[k] = lerp(a.w[k], b.w[k], t)
  return out
}

export function clonePose(p) {
  return { f: p.f.map((x) => ({ ...x })), t: { ...p.t }, w: { ...p.w } }
}

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// each finger closes slightly after the previous one, and opens in reverse
const DELAY = { thumb: 0, f: [0.0, 0.06, 0.14, 0.22] }
const _o = clonePose(POSE_OPEN)
const _a = clonePose(POSE_OPEN)

/** curl 0 = open, ~0.15 = resting, 1 = gripping. `t` is seconds, for micro movement. */
export function poseFromCurl(c, t = 0, out = clonePose(POSE_REST)) {
  const rest = sstep(0, 0.15, c) // 0 open .. 1 relaxed hover
  const base = blendPose(POSE_OPEN, POSE_REST, rest, _o)
  const span = 0.62
  for (let i = 0; i < 4; i++) {
    const k = sstep(0.15 + DELAY.f[i] * 0.55, 0.15 + DELAY.f[i] * 0.55 + span, Math.max(c, 0.15))
    for (const key in base.f[i]) out.f[i][key] = lerp(base.f[i][key], POSE_GRIP.f[i][key], k)
  }
  const kt = sstep(0.15, 0.15 + span, Math.max(c, 0.15))
  for (const key in base.t) out.t[key] = lerp(base.t[key], POSE_GRIP.t[key], kt)
  for (const key in base.w) out.w[key] = lerp(base.w[key], POSE_GRIP.w[key], sstep(0.2, 0.9, c))
  // quiet life in the fingers while the hand waits (breathing / pulse)
  const idle = 1 - sstep(0.2, 0.6, c)
  for (let i = 0; i < 4; i++) {
    const s = Math.sin(t * 0.9 + i * 1.7) * 0.025 + Math.sin(t * 1.9 + i * 0.6) * 0.012
    out.f[i].mcp += s * idle
    out.f[i].pip += s * 1.3 * idle
    out.f[i].spread += Math.sin(t * 0.6 + i) * 0.012 * idle
  }
  out.t.abd += Math.sin(t * 0.7) * 0.02 * idle
  return out
}
