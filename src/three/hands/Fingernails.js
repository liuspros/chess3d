import * as THREE from 'three'
import { BONE_NAMES, FINGERS, NAIL, THUMB, dirOf, segLen } from './HandAnatomy.js'

/* Nails are generated *on* the skin: for every point of the plate a ray is cast from the
 * bone axis through the finger's signed-distance field, so the plate follows the exact
 * curvature of the fingertip. Plate outline, nail bed, lunula, cuticle and free edge are
 * all procedural. */

const col = (hex) => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
const C_BED = col('#e3908a')
const C_BED2 = col('#eaa49b')
const C_LUNULA = col('#f1d3c8')
const C_EDGE = col('#f4e6dc')
const C_CUTICLE = col('#cf8d74')
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function buildNails(field, nu = 16, nv = 13) {
  const { sample, grad } = field
  const pos = []
  const nor = []
  const colr = []
  const skinIndex = []
  const skinWeight = []
  const index = []
  const boneIdx = Object.fromEntries(BONE_NAMES.map((b, i) => [b, i]))

  ;[...FINGERS, THUMB].forEach((dg) => {
    const nl = NAIL[dg.name]
    const J2 = dg.J[2]
    const J3 = dg.J[3]
    const d = dirOf(J2, J3)
    const L = segLen(J2, J3)
    const rTip = dg.radii[3]
    // axis coordinate s measured from J3 along d; the extreme tip is s = rTip
    const sStart = rTip - nl.back
    const sEnd = sStart + nl.len
    const base = pos.length / 3
    // direction "up" around the finger axis (dorsal), for the thumb it follows the segment's roll
    const up = new THREE.Vector3(0, 1, 0)
    const dv = new THREE.Vector3(...d)
    up.addScaledVector(dv, -up.dot(dv)).normalize()
    if (dg === THUMB) up.applyAxisAngle(dv, -0.55)
    const side = new THREE.Vector3().crossVectors(up, dv).normalize()

    for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu
      const s = sStart + (sEnd - sStart) * u
      const A = [J3[0] + d[0] * s, J3[1] + d[1] * s, J3[2] + d[2] * s]
      // plate outline: round at the cuticle, nearly square at the free edge
      const half = (nl.wid / 2) * (u < 0.2 ? Math.pow(Math.sin((Math.max(u, 0.0001) / 0.2) * Math.PI * 0.5), 0.55) : u > 0.92 ? 1 - (u - 0.92) * 0.9 : 1)
      const t = Math.min(1, Math.max(0, (s + L) / L))
      const rLoc = dg.radii[2] + (dg.radii[3] - dg.radii[2]) * t
      const rEff = s > 0 ? Math.max(0.03, rTip * Math.sqrt(Math.max(0.0, 1 - (s / rTip) ** 2)) * 0.9 + 0.02) : rLoc
      for (let iv = 0; iv <= nv; iv++) {
        const v = (iv / nv) * 2 - 1
        const th = Math.asin(Math.max(-0.97, Math.min(0.97, (v * half) / (rEff * 1.02))))
        const dir = up.clone().multiplyScalar(Math.cos(th)).addScaledVector(side, Math.sin(th))
        // cast the ray from inside the finger to the surface
        let lo = 0
        let hi = 0.2
        let o0 = [A[0], A[1] - 0.0, A[2]]
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2
          const f = sample(o0[0] + dir.x * mid, o0[1] + dir.y * mid, o0[2] + dir.z * mid)
          if (f < 0) lo = mid
          else hi = mid
        }
        const r = (lo + hi) / 2
        const P = [o0[0] + dir.x * r, o0[1] + dir.y * r, o0[2] + dir.z * r]
        const g = grad(P[0], P[1], P[2])
        // plate stands slightly proud of the skin; it sinks into the nail folds at the sides and the cuticle
        const rise = 0.0042 * (1 - 0.65 * Math.pow(Math.abs(v), 3)) * sstep(0.0, 0.07, u) * (1 - 0.35 * sstep(0.85, 1, u)) + 0.0022
        pos.push(P[0] + g[0] * rise, P[1] + g[1] * rise, P[2] + g[2] * rise)
        nor.push(g[0], g[1], g[2])
        // colour: pink bed, pale lunula, white free edge, skin at the cuticle
        let c = mix3(C_BED, C_BED2, sstep(0.3, 0.8, u) * 0.6)
        c = mix3(c, C_LUNULA, (1 - sstep(0.1, 0.26, u + Math.abs(v) * 0.08)) * sstep(0.04, 0.12, u) * 0.8)
        c = mix3(c, C_EDGE, sstep(0.82, 0.97, u))
        c = mix3(c, C_CUTICLE, 1 - sstep(0.02, 0.1, u))
        c = mix3(c, mix3(c, C_CUTICLE, 0.5), sstep(0.8, 1, Math.abs(v)) * 0.55)
        colr.push(c[0], c[1], c[2])
        const b = boneIdx[`${dg.name}2`]
        skinIndex.push(b, 0, 0, 0)
        skinWeight.push(1, 0, 0, 0)
      }
    }
    for (let iu = 0; iu < nu; iu++) {
      for (let iv = 0; iv < nv; iv++) {
        const a = base + iu * (nv + 1) + iv
        const b = a + 1
        const c = a + nv + 1
        const e = c + 1
        index.push(a, c, b, b, c, e)
      }
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  geometry.setIndex(index)
  // keep winding consistent with the outward field normal
  const P = geometry.attributes.position
  const N = geometry.attributes.normal
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2]
    const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a)
    const wx = P.getX(c) - P.getX(a), wy = P.getY(c) - P.getY(a), wz = P.getZ(c) - P.getZ(a)
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    if (nx * N.getX(a) + ny * N.getY(a) + nz * N.getZ(a) < 0) {
      index[t + 1] = c
      index[t + 2] = b
    }
  }
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  geometry.boundingSphere.radius += 0.3
  return geometry
}
