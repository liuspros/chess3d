import * as THREE from 'three'
import { BLOBS, BONE_NAMES, FINGERS, FOREARM_LOFT, PALM_LOFT, TENDONS, THUMB, dirOf, segLen } from './HandAnatomy.js'

/* ------------------------------------------------------------------ *
 *  Procedural hand mesh.
 *  The hand is described as a signed-distance field (palm loft, muscle
 *  blobs, tendons, three-segment fingers with knuckles and pads, webs,
 *  forearm), blended with smooth-minimum so that every anatomical part
 *  melts into its neighbours: no seams, no cylinders glued onto a ball.
 *  The field is then polygonised with Surface Nets, projected exactly
 *  onto the surface, and skinned to the bone hierarchy.
 *  Ambient occlusion, skin thickness, knuckle / fingertip / crease maps
 *  are baked per vertex from the same field.
 * ------------------------------------------------------------------ */

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* ---------------- primitives ---------------- */
function cone(a, b, ra, rb, ay, k, bone, chain, extra = {}) {
  const L = segLen(a, b)
  const d = dirOf(a, b)
  const bb = Math.max(ra, rb) + 0.0
  return {
    kind: 'cone', bone, chain, k, ...extra,
    box: [Math.min(a[0], b[0]) - bb, Math.min(a[1], b[1]) - bb, Math.min(a[2], b[2]) - bb, Math.max(a[0], b[0]) + bb, Math.max(a[1], b[1]) + bb, Math.max(a[2], b[2]) + bb],
    f(x, y, z) {
      const qx = x - a[0], qy = y - a[1], qz = z - a[2]
      let t = (qx * d[0] + qy * d[1] + qz * d[2]) / L
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const px = qx - d[0] * t * L, py = qy - d[1] * t * L, pz = qz - d[2] * t * L
      const r = ra + (rb - ra) * t
      return (Math.sqrt(px * px + (py / ay) * (py / ay) + pz * pz) - r) * 0.94
    },
  }
}

function ellipsoid(c, r, rot, k, bone, chain) {
  const cs = Math.cos(rot), sn = Math.sin(rot)
  const m = Math.max(...r)
  return {
    kind: 'ell', bone, chain, k,
    box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m],
    f(x, y, z) {
      const dx = x - c[0], dy = y - c[1], dz = z - c[2]
      const qx = (dx * cs - dz * sn) / r[0], qy = dy / r[1], qz = (dx * sn + dz * cs) / r[2]
      const kk = Math.sqrt(qx * qx + qy * qy + qz * qz)
      const g = Math.sqrt((qx / r[0]) ** 2 + (qy / r[1]) ** 2 + (qz / r[2]) ** 2) || 1e-6
      return (kk * (kk - 1)) / g
    },
  }
}

function loft(stations, k, bone, chain) {
  const zs = stations.map((s) => s[0])
  const zmin = zs[0], zmax = zs[zs.length - 1]
  const hxMax = Math.max(...stations.map((s) => s[1])), hyMax = Math.max(...stations.map((s) => s[2]))
  return {
    kind: 'loft', bone, chain, k,
    box: [-hxMax, -hyMax - 0.05, zmin, hxMax, hyMax + 0.05, zmax],
    f(x, y, z) {
      const zc = Math.min(zmax, Math.max(zmin, z))
      let i = 0
      while (i < stations.length - 2 && zc > stations[i + 1][0]) i++
      const s0 = stations[i], s1 = stations[i + 1]
      const t = smooth(0, 1, (zc - s0[0]) / (s1[0] - s0[0]))
      const hx = s0[1] + (s1[1] - s0[1]) * t
      const hy = s0[2] + (s1[2] - s0[2]) * t
      const cy = s0[3] + (s1[3] - s0[3]) * t
      const ax = Math.abs(x) / hx, ay = Math.abs(y - cy) / hy
      const n = 2.7
      const m = Math.pow(Math.pow(ax, n) + Math.pow(ay, n), 1 / n)
      const d2 = (m - 1) * Math.min(hx, hy) * 0.95
      const dz = Math.max(zmin - z, z - zmax)
      return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0)
    },
  }
}

export function buildPrims() {
  const P = []
  P.push(loft(PALM_LOFT, 0, 'hand', 'palm'))
  P.push(loft(FOREARM_LOFT, 0, 'forearm', 'forearm'))
  BLOBS.forEach((b) => P.push(ellipsoid(b.c, b.r, b.rot, b.k, b.bone, b.bone === 'thumb0' ? 'thumb' : 'palm')))
  TENDONS.forEach((t) => P.push(cone(t.a, t.b, t.ra, t.rb, t.ay, 0.03, t.bone, 'palm')))
  ;[...FINGERS, THUMB].forEach((dg) => {
    const isThumb = dg === THUMB
    for (let s = 0; s < 3; s++) {
      let a = dg.J[s]
      const b = dg.J[s + 1]
      const ay = (dg.ay[s] + dg.ay[s + 1]) / 2
      if (s === 0 && !isThumb) {
        const d = dirOf(dg.J[0], dg.J[1])
        a = [a[0] - d[0] * 0.1, a[1] - d[1] * 0.1, a[2] - d[2] * 0.1] // roots the finger inside the palm
      }
      P.push(cone(a, b, dg.radii[s], dg.radii[s + 1], ay, isThumb ? 0.035 : 0.028, `${dg.name}${s}`, dg.name, { seg: s }))
    }
    // fingertip pad: soft bulge on the palm side
    const J3 = dg.J[3]
    const d = dirOf(dg.J[2], dg.J[3])
    const rr = dg.radii[3]
    P.push(ellipsoid([J3[0] - d[0] * 0.03, J3[1] - 0.012, J3[2] - d[2] * 0.03], [rr * 0.98, rr * 0.82, 0.058], Math.atan2(d[0], d[2]) * -1, 0.02, `${dg.name}2`, dg.name))
    // knuckles: dorsal bumps over MCP / PIP / DIP
    const bumps = [
      [0, 0.02, 1.0, `${dg.name}0`],
      [1, 0.014, 0.98, `${dg.name}0`],
      [2, 0.008, 0.95, `${dg.name}1`],
    ]
    bumps.forEach(([j, up, sc, bone]) => {
      if (isThumb && j === 0) return
      const J = dg.J[j]
      const r = dg.radii[j] * sc
      P.push(ellipsoid([J[0], J[1] + up, J[2]], [r * 1.02, r * 0.78, r * 0.9], 0, 0.02, bone, dg.name))
    })
  })
  return P
}

/* ---------------- surface nets ---------------- */
export function buildBody(res = 0.022) {
  const prims = buildPrims()
  const lo = [-1.12, -0.42, -1.5]
  const hi = [0.78, 0.42, 2.12]
  const n = [Math.ceil((hi[0] - lo[0]) / res) + 1, Math.ceil((hi[1] - lo[1]) / res) + 1, Math.ceil((hi[2] - lo[2]) / res) + 1]
  const [nx, ny, nz] = n
  const FAR = 0.4
  const grid = new Float32Array(nx * ny * nz).fill(FAR)
  const MARGIN = 0.17
  const idx = (i, j, k) => i + nx * (j + ny * k)

  prims.forEach((p, pi) => {
    const b = p.box
    const i0 = Math.max(0, Math.floor((b[0] - MARGIN - lo[0]) / res)), i1 = Math.min(nx - 1, Math.ceil((b[3] + MARGIN - lo[0]) / res))
    const j0 = Math.max(0, Math.floor((b[1] - MARGIN - lo[1]) / res)), j1 = Math.min(ny - 1, Math.ceil((b[4] + MARGIN - lo[1]) / res))
    const k0 = Math.max(0, Math.floor((b[2] - MARGIN - lo[2]) / res)), k1 = Math.min(nz - 1, Math.ceil((b[5] + MARGIN - lo[2]) / res))
    for (let k = k0; k <= k1; k++) {
      const z = lo[2] + k * res
      for (let j = j0; j <= j1; j++) {
        const y = lo[1] + j * res
        let o = idx(i0, j, k)
        for (let i = i0; i <= i1; i++, o++) {
          const v = p.f(lo[0] + i * res, y, z)
          const g = grid[o]
          grid[o] = pi === 0 || g >= FAR ? Math.min(v, FAR) : p.k > 0 ? smin(g, v, p.k) : Math.min(g, v)
        }
      }
    }
  })

  const sample = (x, y, z) => {
    let fx = (x - lo[0]) / res, fy = (y - lo[1]) / res, fz = (z - lo[2]) / res
    fx = Math.min(nx - 1.001, Math.max(0, fx)); fy = Math.min(ny - 1.001, Math.max(0, fy)); fz = Math.min(nz - 1.001, Math.max(0, fz))
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz)
    const tx = fx - i, ty = fy - j, tz = fz - k
    const o = idx(i, j, k)
    const c000 = grid[o], c100 = grid[o + 1], c010 = grid[o + nx], c110 = grid[o + nx + 1]
    const oz = o + nx * ny
    const c001 = grid[oz], c101 = grid[oz + 1], c011 = grid[oz + nx], c111 = grid[oz + nx + 1]
    const a0 = c000 + (c100 - c000) * tx, a1 = c010 + (c110 - c010) * tx, a2 = c001 + (c101 - c001) * tx, a3 = c011 + (c111 - c011) * tx
    const b0 = a0 + (a1 - a0) * ty, b1 = a2 + (a3 - a2) * ty
    return b0 + (b1 - b0) * tz
  }
  const grad = (x, y, z, e = res * 0.75) => {
    const gx = sample(x + e, y, z) - sample(x - e, y, z)
    const gy = sample(x, y + e, z) - sample(x, y - e, z)
    const gz = sample(x, y, z + e) - sample(x, y, z - e)
    const l = Math.hypot(gx, gy, gz) || 1
    return [gx / l, gy / l, gz / l]
  }

  /* --- surface nets: one vertex per sign-changing cell --- */
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k)
  const pos = []
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const vals = new Float32Array(8)
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          const v = grid[idx(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])]
          vals[c] = v
          if (v < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0, sy = 0, sz = 0, cnt = 0
        for (let e = 0; e < 12; e++) {
          const [a, b] = EDGES[e]
          const va = vals[a], vb = vals[b]
          if (va < 0 === vb < 0) continue
          const t = va / (va - vb)
          sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t
          sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t
          sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t
          cnt++
        }
        cellVert[cidx(i, j, k)] = pos.length / 3
        pos.push(lo[0] + (i + sx / cnt) * res, lo[1] + (j + sy / cnt) * res, lo[2] + (k + sz / cnt) * res)
      }
    }
  }
  // project onto the exact iso-surface (two Newton steps along the gradient)
  for (let v = 0; v < pos.length; v += 3) {
    for (let it = 0; it < 2; it++) {
      const d = sample(pos[v], pos[v + 1], pos[v + 2])
      const g = grad(pos[v], pos[v + 1], pos[v + 2])
      const s = Math.max(-res, Math.min(res, d)) * 0.9
      pos[v] -= g[0] * s; pos[v + 1] -= g[1] * s; pos[v + 2] -= g[2] * s
    }
  }
  const index = []
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) index.push(a, c, b, a, d, c)
    else index.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = grid[idx(i, j, k)] < 0
        // x edge
        if (v0 !== grid[idx(i + 1, j, k)] < 0) quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], v0)
        // y edge
        if (v0 !== grid[idx(i, j + 1, k)] < 0) quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], v0)
        // z edge
        if (v0 !== grid[idx(i, j, k + 1)] < 0) quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], v0)
      }
    }
  }
  // make every triangle agree with the field gradient
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2]
    const nxv = uy * wz - uz * wy, nyv = uz * wx - ux * wz, nzv = ux * wy - uy * wx
    const g = grad((pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3)
    if (nxv * g[0] + nyv * g[1] + nzv * g[2] < 0) {
      const tmp = index[t + 1]
      index[t + 1] = index[t + 2]
      index[t + 2] = tmp
    }
  }

  /* --- per-vertex data --- */
  const nv = pos.length / 3
  const normals = new Float32Array(nv * 3)
  const rest = new Float32Array(pos)
  const tone = new Float32Array(nv * 4)
  const crease = new Float32Array(nv * 2)
  const ao = new Float32Array(nv)
  const skinIndex = new Uint16Array(nv * 4)
  const skinWeight = new Float32Array(nv * 4)
  const boneIdx = Object.fromEntries(BONE_NAMES.map((b, i) => [b, i]))
  const digitsAll = [...FINGERS, THUMB]
  const w = new Float32Array(BONE_NAMES.length)

  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]
    const g = grad(x, y, z, res * 0.9)
    normals.set(g, v * 3)

    // ambient occlusion from the field itself (cavities between fingers, under the thumb, wrist crease)
    let occ = 0
    const steps = [0.018, 0.04, 0.07, 0.11]
    for (let s = 0; s < steps.length; s++) {
      const d = sample(x + g[0] * steps[s], y + g[1] * steps[s], z + g[2] * steps[s])
      occ += Math.max(0, steps[s] - d) / (steps[s] * (1 + s * 1.2))
    }
    ao[v] = Math.min(1, Math.max(0.35, 1 - occ * 0.32))

    // thickness: how far inwards until we leave the flesh again (drives light transmission)
    let th = 0.3
    for (let s = 0.014; s < 0.3; s += 0.014) {
      if (sample(x - g[0] * s, y - g[1] * s, z - g[2] * s) > -0.004) {
        th = s
        break
      }
    }

    // nearest primitives -> skin weights
    let dmin = 1e9, chainMin = ''
    const ds = new Float32Array(prims.length)
    for (let p = 1; p < prims.length; p++) {
      const d = prims[p].f(x, y, z)
      ds[p] = d
      if (d < dmin) {
        dmin = d
        chainMin = prims[p].chain
      }
    }
    ds[0] = prims[0].f(x, y, z)
    if (ds[0] < dmin) {
      dmin = ds[0]
      chainMin = 'palm'
    }
    w.fill(0)
    for (let p = 0; p < prims.length; p++) {
      const pr = prims[p]
      const same = pr.chain === chainMin
      const proximal = pr.bone.endsWith('0') && pr.bone !== 'hand'
      const family = (pr.chain === 'palm' || chainMin === 'palm') && (proximal || pr.chain === 'thumb' || chainMin === 'thumb')
      const tau = same ? 0.05 : family ? 0.034 : 0.011
      w[boneIdx[pr.bone]] += Math.exp(-(ds[p] - dmin) / tau)
    }
    // forearm <-> hand twist ramp
    const mass = w[boneIdx.forearm] + w[boneIdx.hand]
    const fr = 1 - smooth(-0.5, 0.02, z)
    w[boneIdx.forearm] = mass * fr
    w[boneIdx.hand] = mass * (1 - fr)
    // top four
    let order = []
    for (let b = 0; b < w.length; b++) if (w[b] > 1e-4) order.push(b)
    order.sort((a, b) => w[b] - w[a])
    order = order.slice(0, 4)
    let sum = 0
    order.forEach((b) => (sum += w[b]))
    for (let s = 0; s < 4; s++) {
      skinIndex[v * 4 + s] = order[s] ?? 0
      skinWeight[v * 4 + s] = order[s] != null ? w[order[s]] / sum : 0
    }

    // knuckles, fingertips, creases
    let kn = 0, tip = 0, cu = 0, cw = 0
    digitsAll.forEach((dg) => {
      const isT = dg === THUMB
      for (let j = 0; j < 4; j++) {
        const J = dg.J[j]
        const dd = Math.hypot(x - J[0], y - J[1], z - J[2])
        if (j < 3) {
          const wj = [isT ? 0.4 : 1, 1, 0.7][j]
          kn = Math.max(kn, Math.exp(-((dd / 0.075) ** 2)) * wj)
        } else tip = Math.max(tip, Math.exp(-((dd / 0.1) ** 2)))
        if (j < 3 && chainMin === dg.name) {
          const dir = dirOf(dg.J[Math.min(j, 2)], dg.J[Math.min(j, 2) + 1])
          const u = (x - J[0]) * dir[0] + (y - J[1]) * dir[1] + (z - J[2]) * dir[2]
          if (Math.abs(u) < 0.07 && (cw === 0 || Math.abs(u) < Math.abs(cu))) {
            cu = u
            cw = j === 0 ? 0.6 : 1
          }
        }
      }
    })
    tone.set([kn, tip, -g[1], Math.min(1, th / 0.22)], v * 4)
    crease.set([cu, cw], v * 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('aRest', new THREE.BufferAttribute(rest, 3))
  geometry.setAttribute('aTone', new THREE.BufferAttribute(tone, 4))
  geometry.setAttribute('aCrease', new THREE.BufferAttribute(crease, 2))
  geometry.setAttribute('aAO', new THREE.BufferAttribute(ao, 1))
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  geometry.boundingSphere.radius += 0.3 // skinned bounds change when bending: never cull
  return { geometry, sample, grad, res }
}
