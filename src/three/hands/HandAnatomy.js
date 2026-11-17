/* ------------------------------------------------------------------ *
 *  Hand anatomy: every dimension of the hand lives here.
 *
 *  Units: 1 = 10 cm (a board square is 1). Local axes of a RIGHT hand:
 *    +z = towards the fingertips, +y = back of the hand, -y = palm side,
 *    -x = thumb side. The left hand is the same mesh mirrored in x.
 *  The rest pose is a flat open hand; poses are applied by the rig.
 * ------------------------------------------------------------------ */

export const V = (x, y, z) => [x, y, z]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => mul(a, 1 / len(a))

/** Joint positions of a straight finger that fans out by `yaw`. */
function finger(name, x, zMcp, lens, radii, yaw, extra = {}) {
  const d = [Math.sin(yaw), 0, Math.cos(yaw)]
  const J = [[x, 0.012, zMcp]]
  lens.forEach((L) => J.push(add(J[J.length - 1], mul(d, L))))
  return { name, J, radii, yaw, ay: [0.9, 0.88, 0.84, 0.8], ...extra }
}

// MCP knuckle line is arched: the middle finger sits furthest forward, the pinky furthest back.
export const FINGERS = [
  finger('index', -0.3, 0.97, [0.4, 0.23, 0.2], [0.082, 0.072, 0.064, 0.056], -0.045),
  finger('middle', -0.1, 1.0, [0.45, 0.27, 0.21], [0.085, 0.074, 0.066, 0.058], 0.0),
  finger('ring', 0.1, 0.96, [0.41, 0.25, 0.2], [0.08, 0.07, 0.062, 0.055], 0.05),
  finger('pinky', 0.285, 0.88, [0.32, 0.19, 0.17], [0.07, 0.061, 0.054, 0.049], 0.115),
]

/** Thumb: metacarpal (CMC -> MCP), proximal and distal phalanx. Joint chain is bent, not straight. */
const T0 = V(-0.3, -0.075, 0.1)
const T1 = V(-0.56, -0.115, 0.43)
const T2 = V(-0.69, -0.115, 0.7)
const T3 = V(-0.775, -0.105, 0.935)
export const THUMB = {
  name: 'thumb',
  J: [T0, T1, T2, T3],
  radii: [0.115, 0.092, 0.08, 0.07],
  ay: [0.85, 0.9, 0.9, 0.85],
  roll: [0.95, 0.95, 0.95], // axial rotation of each segment so flexion goes across the palm
}

/** Palm + forearm are lofts of super-ellipses: z, half-width, half-thickness, centre-y */
export const PALM_LOFT = [
  [-0.45, 0.325, 0.225, 0.0],
  [-0.3, 0.318, 0.215, 0.0],
  [-0.12, 0.312, 0.2, 0.0],
  [0.12, 0.372, 0.145, -0.005],
  [0.45, 0.425, 0.108, 0.0],
  [0.8, 0.44, 0.098, 0.01],
  [0.98, 0.43, 0.092, 0.012],
  [1.1, 0.36, 0.058, 0.0],
  [1.18, 0.27, 0.03, 0.0],
]
export const FOREARM_LOFT = [
  [-1.45, 0.38, 0.3, 0.0],
  [-0.8, 0.345, 0.255, 0.0],
  [-0.45, 0.325, 0.225, 0.0],
  [-0.3, 0.318, 0.215, 0.0],
  [-0.12, 0.312, 0.2, 0.0],
]

export const BONES = {
  wrist: { parent: null },
  forearm: { parent: 'wrist' },
  hand: { parent: 'wrist' },
}

/** Skin ellipsoids that give the palm its muscle structure. */
export const BLOBS = [
  { name: 'thenar', c: [-0.27, -0.068, 0.3], r: [0.19, 0.1, 0.29], bone: 'thumb0', k: 0.06, rot: -0.35 },
  { name: 'thenar2', c: [-0.19, -0.06, 0.12], r: [0.16, 0.09, 0.18], bone: 'thumb0', k: 0.06, rot: 0 },
  { name: 'hypothenar', c: [0.335, -0.05, 0.36], r: [0.115, 0.082, 0.27], bone: 'hand', k: 0.05, rot: 0.1 },
  { name: 'padMid', c: [0.0, -0.075, 0.7], r: [0.3, 0.04, 0.12], bone: 'hand', k: 0.05, rot: 0 },
  { name: 'thumbWeb', c: [-0.44, -0.06, 0.66], r: [0.16, 0.04, 0.2], bone: 'hand', k: 0.04, rot: -0.35 },
  // webbing between the fingers
  { name: 'web0', c: [-0.2, -0.012, 1.08], r: [0.07, 0.03, 0.11], bone: 'hand', k: 0.022, rot: 0 },
  { name: 'web1', c: [0.0, -0.012, 1.07], r: [0.07, 0.03, 0.11], bone: 'hand', k: 0.022, rot: 0 },
  { name: 'web2', c: [0.19, -0.012, 1.03], r: [0.07, 0.03, 0.11], bone: 'hand', k: 0.022, rot: 0 },
]

/** Raised tendon ridges on the back of the hand (extensor tendons) */
export const TENDONS = FINGERS.map((f, i) => ({
  a: [f.J[0][0] * 0.82, 0.088, 0.08],
  b: [f.J[0][0], 0.097, f.J[0][2] - 0.02],
  ra: 0.034,
  rb: 0.038,
  ay: 0.55,
  bone: 'hand',
}))

export function dirOf(a, b) {
  return norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
}
export const segLen = (a, b) => len([b[0] - a[0], b[1] - a[1], b[2] - a[2]])

/** Anatomy of every digit as a list of bone segments. */
export function digits() {
  return [...FINGERS, THUMB]
}

export const NAIL = {
  // len = plate length, back = distance from the extreme fingertip back to the cuticle
  index: { len: 0.118, wid: 0.1, back: 0.13 },
  middle: { len: 0.122, wid: 0.104, back: 0.134 },
  ring: { len: 0.115, wid: 0.098, back: 0.127 },
  pinky: { len: 0.097, wid: 0.08, back: 0.11 },
  thumb: { len: 0.14, wid: 0.128, back: 0.15 },
}

/** Every skinning bone, in skeleton order. Segment k of a digit is bone `${name}${k}`. */
export const BONE_NAMES = ['wrist', 'forearm', 'hand', ...digits().flatMap((d) => [0, 1, 2].map((k) => `${d.name}${k}`))]
