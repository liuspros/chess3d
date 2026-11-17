import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// All pieces are built in code: lathe-turned bodies + a few primitives.
// 1 unit = 1 board square. Pieces stand on y = 0.

let SEG = 48

function lathe(points, seg = SEG) {
  const v = points.map(([r, y]) => new THREE.Vector2(r, y))
  return new THREE.LatheGeometry(v, seg)
}

// Catmull-Rom smoothed profile -> rounded, turned-wood look
function smoothLathe(points, seg = SEG, div = 5) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)))
  const pts = curve
    .getPoints(points.length * div)
    .map((p) => new THREE.Vector2(Math.max(0, p.x), Math.max(0, p.y)))
  return new THREE.LatheGeometry(pts, seg)
}

function sphere(r, y, x = 0, z = 0, sy = 1) {
  const g = new THREE.SphereGeometry(r, 24, 18)
  g.scale(1, sy, 1)
  g.translate(x, y, z)
  return g
}

function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (ry) g.rotateY(ry)
  g.translate(x, y, z)
  return g
}

function merge(parts) {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const name of Object.keys(n.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name)
    }
    return n
  })
  const m = mergeGeometries(clean, false)
  m.computeBoundingSphere()
  return m
}

const BASE = [
  [0, 0],
  [0.34, 0],
  [0.36, 0.03],
  [0.36, 0.08],
  [0.32, 0.12],
  [0.28, 0.15],
]

function pawn() {
  const body = smoothLathe([
    ...BASE,
    [0.2, 0.22],
    [0.14, 0.36],
    [0.12, 0.46],
    [0.19, 0.5],
    [0.2, 0.54],
    [0.14, 0.57],
    [0.1, 0.6],
    [0, 0.62],
  ])
  return merge([body, sphere(0.17, 0.7)])
}

function rook() {
  const body = smoothLathe([
    ...BASE,
    [0.24, 0.2],
    [0.2, 0.3],
    [0.17, 0.5],
    [0.17, 0.62],
  ])
  const plate = lathe([
    [0, 0.6],
    [0.25, 0.64],
    [0.28, 0.7],
    [0.28, 0.8],
    [0, 0.8],
  ])
  const parts = [body, plate]
  // crenellations
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    parts.push(box(0.12, 0.13, 0.1, Math.cos(a) * 0.21, 0.865, Math.sin(a) * 0.21, -a))
  }
  return merge(parts)
}

function bishop() {
  const body = smoothLathe([
    ...BASE,
    [0.22, 0.22],
    [0.15, 0.4],
    [0.12, 0.55],
    [0.2, 0.6],
    [0.2, 0.64],
    [0.12, 0.68],
    [0.17, 0.76],
    [0.17, 0.86],
    [0.13, 0.97],
    [0.06, 1.06],
    [0, 1.1],
  ])
  return merge([body, sphere(0.05, 1.14)])
}

function queen() {
  const body = smoothLathe([
    ...BASE,
    [0.24, 0.22],
    [0.17, 0.42],
    [0.14, 0.62],
    [0.13, 0.78],
    [0.19, 0.84],
    [0.2, 0.88],
    [0.13, 0.92],
    [0.15, 0.96],
    [0.25, 1.08],
    [0.26, 1.14],
    [0.2, 1.16],
    [0, 1.14],
  ])
  const parts = [body, sphere(0.08, 1.22)]
  const n = 8
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    parts.push(sphere(0.045, 1.18, Math.cos(a) * 0.22, Math.sin(a) * 0.22))
  }
  return merge(parts)
}

function king() {
  const body = smoothLathe([
    ...BASE,
    [0.24, 0.22],
    [0.18, 0.42],
    [0.15, 0.62],
    [0.14, 0.8],
    [0.2, 0.86],
    [0.21, 0.9],
    [0.14, 0.94],
    [0.17, 1.0],
    [0.24, 1.1],
    [0.25, 1.16],
    [0.18, 1.2],
    [0, 1.2],
  ])
  return merge([body, box(0.07, 0.28, 0.07, 0, 1.34, 0), box(0.2, 0.07, 0.07, 0, 1.37, 0)])
}

function knightHead() {
  const s = new THREE.Shape()
  s.moveTo(-0.2, 0)
  s.lineTo(0.2, 0)
  s.quadraticCurveTo(0.24, 0.12, 0.18, 0.24) // chest
  s.quadraticCurveTo(0.14, 0.34, 0.2, 0.4) // throat
  s.quadraticCurveTo(0.3, 0.38, 0.42, 0.36) // jaw
  s.quadraticCurveTo(0.52, 0.38, 0.52, 0.47) // muzzle
  s.quadraticCurveTo(0.5, 0.55, 0.4, 0.62) // nose bridge
  s.quadraticCurveTo(0.34, 0.7, 0.3, 0.78) // forehead
  s.lineTo(0.26, 0.92) // ear
  s.lineTo(0.17, 0.82)
  s.quadraticCurveTo(0.06, 0.88, -0.04, 0.8) // poll
  s.quadraticCurveTo(-0.2, 0.62, -0.24, 0.3) // mane / neck
  s.quadraticCurveTo(-0.26, 0.12, -0.2, 0)
  return s
}

function knight() {
  const base = smoothLathe([...BASE, [0.24, 0.2], [0.2, 0.22], [0, 0.22]])
  const head = new THREE.ExtrudeGeometry(knightHead(), {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 3,
    curveSegments: 14,
  })
  head.translate(0, 0, -0.13)
  head.scale(0.92, 0.92, 0.92)
  head.translate(0, 0.2, 0)
  return merge([base, head])
}

// approximate heights (board units) used for hand grips and shadows
export const PIECE_H = { p: 0.86, n: 1.05, b: 1.18, r: 0.93, q: 1.3, k: 1.48 }

/* ---- "modern" set: bold, simple turned shapes ---- */
const MB = [
  [0, 0],
  [0.34, 0],
  [0.34, 0.07],
  [0.22, 0.13],
]
function mPawn() {
  return merge([lathe([...MB, [0.13, 0.42], [0.1, 0.5], [0, 0.5]]), sphere(0.17, 0.62)])
}
function mRook() {
  const body = lathe([...MB, [0.23, 0.2], [0.23, 0.74], [0.3, 0.76], [0.3, 0.9], [0, 0.9]])
  const parts = [body]
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    parts.push(box(0.16, 0.12, 0.16, Math.cos(a) * 0.2, 0.96, Math.sin(a) * 0.2, -a))
  }
  return merge(parts)
}
function mBishop() {
  return merge([lathe([...MB, [0.16, 0.7], [0.22, 0.82], [0.14, 1.0], [0, 1.08]]), sphere(0.06, 1.12)])
}
function mQueen() {
  const t = new THREE.TorusGeometry(0.2, 0.04, 10, 32)
  t.rotateX(Math.PI / 2)
  t.translate(0, 1.2, 0)
  return merge([lathe([...MB, [0.16, 0.95], [0.27, 1.17], [0, 1.17]]), t, sphere(0.07, 1.27)])
}
function mKing() {
  return merge([lathe([...MB, [0.17, 0.98], [0.27, 1.2], [0, 1.2]]), box(0.08, 0.3, 0.08, 0, 1.36, 0), box(0.22, 0.08, 0.08, 0, 1.4, 0)])
}

export function createPieceGeometries(style = 'staunton', seg = 48) {
  SEG = seg
  if (style === 'modern') return { p: mPawn(), n: knight(), b: mBishop(), r: mRook(), q: mQueen(), k: mKing() }
  return { p: pawn(), n: knight(), b: bishop(), r: rook(), q: queen(), k: king() }
}

export function disposeGeometries(geos) {
  Object.values(geos).forEach((g) => g.dispose())
}
