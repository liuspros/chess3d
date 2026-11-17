// Pure procedural texture generators (no DOM, no three.js) so they can run in a Web Worker.
// Each returns { color: Uint8ClampedArray(RGBA), height: Uint8ClampedArray(RGBA grayscale) }.

function hash(x, y, s) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

function vnoise(x, y, s) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, y, s, oct = 4) {
  let sum = 0
  let amp = 0.5
  let f = 1
  let norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 17)
    norm += amp
    f *= 2
    amp *= 0.5
  }
  return sum / norm // 0..1
}

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const mix = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function genMarble(size, o = {}) {
  const seed = o.seed ?? 1
  const base = o.base ?? [244, 240, 232]
  const vein = o.vein ?? [112, 112, 118]
  const strength = o.strength ?? 0.8
  const sc = o.scale ?? 1
  const warmth = o.warmth ?? 1
  const color = new Uint8ClampedArray(size * size * 4)
  const height = new Uint8ClampedArray(size * size * 4)
  const PI = Math.PI
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * 3 * sc
      const ny = (y / size) * 3 * sc
      const cloud = fbm(nx * 1.1, ny * 1.1, seed, 5)
      const tintN = fbm(nx * 0.7 + 9, ny * 0.7 + 3, seed + 5, 3)
      const w = (fbm(nx * 1.5 + 11, ny * 1.5 + 7, seed + 3, 5) - 0.45) * 5

      // main veins: sparse, wide halo + sharp core
      const a = Math.sin((nx * 1.25 + ny * 0.9) * PI + w * 3.2)
      const maskA = smooth(0.36, 0.68, fbm(nx * 1.3 + 3, ny * 1.3 + 5, seed + 9, 3))
      const coreA = Math.pow(1 - Math.abs(a), 26) * maskA
      const haloA = Math.pow(1 - Math.abs(a), 4) * maskA

      // secondary veins crossing at an angle
      const b = Math.sin((nx * 2.9 - ny * 2.1) * PI + w * 5.0)
      const maskB = smooth(0.4, 0.7, fbm(nx * 2.1 + 17, ny * 2.1 + 2, seed + 21, 3))
      const coreB = Math.pow(1 - Math.abs(b), 34) * maskB * 0.6

      // capillaries
      const c = Math.sin((nx * 7.1 + ny * 5.3) * PI + w * 9.0)
      const maskC = smooth(0.45, 0.75, fbm(nx * 3.3 + 5, ny * 3.3 + 8, seed + 33, 2))
      const coreC = Math.pow(1 - Math.abs(c), 46) * maskC * 0.3

      const vv = clamp((coreA + coreB + coreC) * strength)
      const shade = 0.9 + cloud * 0.16
      const grain = (hash(x, y, seed + 77) - 0.5) * 0.04
      const warm = (tintN - 0.5) * 0.06 * warmth

      let r = base[0] * (shade + warm + grain)
      let g = base[1] * (shade + grain)
      let bl = base[2] * (shade - warm + grain)

      // soft halo around veins
      const h = haloA * 0.10 * strength
      r = mix(r, vein[0], h)
      g = mix(g, vein[1], h)
      bl = mix(bl, vein[2], h)

      r = mix(r, vein[0], vv)
      g = mix(g, vein[1], vv)
      bl = mix(bl, vein[2], vv)

      const i = (y * size + x) * 4
      color[i] = r
      color[i + 1] = g
      color[i + 2] = bl
      color[i + 3] = 255
      const hv = clamp(170 + (hash(x, y, seed + 91) - 0.5) * 16 - vv * 30, 0, 255)
      height[i] = height[i + 1] = height[i + 2] = hv
      height[i + 3] = 255
    }
  }
  return { color, height }
}

// Flat-sawn ("cathedral") wood: stretched ring arcs, early/late wood, pores, streaks.
export function genWood(size, o = {}) {
  const seed = o.seed ?? 1
  const light = o.light ?? [170, 118, 70]
  const dark = o.dark ?? [92, 56, 30]
  const rings = o.rings ?? 9
  const stretch = o.stretch ?? 0.14
  const cx = o.cx ?? 0.5 + (hash(seed, 3, 1) - 0.5) * 1.2
  const cy = o.cy ?? 0.5 + (hash(seed, 5, 2) - 0.5) * 3
  const poreAmt = o.pores ?? 0.24
  const patch = o.patch ?? 0.14
  const color = new Uint8ClampedArray(size * size * 4)
  const height = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const warp = (fbm(u * 3, v * 1.3, seed, 4) - 0.5) * 0.3
      const warp2 = (fbm(u * 9, v * 2.2, seed + 4, 3) - 0.5) * 0.05
      const dx = u - cx + warp2
      const dy = (v - cy) * stretch
      const d = Math.sqrt(dx * dx + dy * dy)
      const t = (d + warp) * rings * 2
      const ring = t - Math.floor(t)
      // slow rise through early wood, abrupt latewood edge
      const p = ring < 0.8 ? Math.pow(ring / 0.8, 1.6) * 0.75 : 0.75 + (1 - (ring - 0.8) / 0.2) * 0.25
      const late = ring > 0.8 ? 1 - (ring - 0.8) / 0.2 : 0
      const pore = smooth(0.58, 0.8, fbm(u * 110, v * 7, seed + 7, 3))
      const streak = fbm(u * 170, v * 3.2, seed + 13, 2) - 0.5
      const patches = fbm(u * 2.2, v * 0.8, seed + 21, 3) - 0.5
      let m = clamp(0.2 + p * 0.65 + late * 0.15 + streak * 0.18 + patches * patch * 3)
      m = m * (1 - pore * poreAmt)
      const i = (y * size + x) * 4
      color[i] = mix(light[0], dark[0], m)
      color[i + 1] = mix(light[1], dark[1], m)
      color[i + 2] = mix(light[2], dark[2], m)
      color[i + 3] = 255
      const hv = clamp(150 + (1 - m) * 40 - pore * 55 + streak * 20, 0, 255)
      height[i] = height[i + 1] = height[i + 2] = hv
      height[i + 3] = 255
    }
  }
  return { color, height }
}

/* ---------- brushed / cast metal (gold, silver, bronze) ---------- */
export function genMetal(size, o = {}) {
  const seed = o.seed ?? 3
  const base = o.base ?? [201, 164, 92]
  const hi = o.hi ?? [244, 214, 140]
  const lo = o.lo ?? [120, 88, 40]
  const brushed = o.brushed ?? 0.5
  const mottle = o.mottle ?? 0.35
  const color = new Uint8ClampedArray(size * size * 4)
  const height = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const cloud = fbm(u * 3, v * 3, seed, 4)
      const streak = fbm(u * 2, v * 90, seed + 9, 3) // long horizontal brush marks
      const t = clamp(0.5 + (cloud - 0.5) * mottle * 2 + (streak - 0.5) * brushed)
      let r, g, b
      if (t < 0.5) {
        const k = t * 2
        r = mix(lo[0], base[0], k); g = mix(lo[1], base[1], k); b = mix(lo[2], base[2], k)
      } else {
        const k = (t - 0.5) * 2
        r = mix(base[0], hi[0], k); g = mix(base[1], hi[1], k); b = mix(base[2], hi[2], k)
      }
      const i = (y * size + x) * 4
      color[i] = r; color[i + 1] = g; color[i + 2] = b; color[i + 3] = 255
      const h = clamp(0.5 + (streak - 0.5) * brushed * 0.9) * 255
      height[i] = h; height[i + 1] = h; height[i + 2] = h; height[i + 3] = 255
    }
  }
  return { color, height }
}

/* ---------- Adire: hand-dyed indigo cloth with resist rings and stitched lines ---------- */
export function genAdire(size, o = {}) {
  const seed = o.seed ?? 4
  const dye = o.dye ?? [22, 40, 92] // indigo
  const dyeLight = o.dyeLight ?? [48, 78, 150]
  const resist = o.resist ?? [238, 232, 214] // cream where the dye was blocked
  const invert = !!o.invert
  const color = new Uint8ClampedArray(size * size * 4)
  const height = new Uint8ClampedArray(size * size * 4)
  // a few tie-dye centres (wrap-around so tiles feel seamless inside a square)
  const n = o.spots ?? 3
  const spots = []
  for (let i = 0; i < n; i++) spots.push([hash(i, 1, seed), hash(i, 2, seed), 0.7 + hash(i, 3, seed) * 0.7])
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let best = 9
      let bs = 1
      for (const [cx, cy, sc] of spots) {
        const wob = (fbm(u * 6, v * 6, seed + 5, 3) - 0.5) * 0.12
        const d = Math.hypot(u - cx, v - cy) + wob
        if (d * sc < best) { best = d * sc; bs = sc }
      }
      // concentric resist rings with dyed gaps
      const ring = Math.sin(best * 20 + fbm(u * 8, v * 8, seed + 11, 2) * 2.2)
      const resisted = smooth(0.15, 0.55, ring)
      // stitched grid lines (the "adire eleko" feel)
      const sx = Math.abs(((u * 6) % 1) - 0.5)
      const sy = Math.abs(((v * 6) % 1) - 0.5)
      const stitch = smooth(0.47, 0.5, Math.max(sx, sy)) * 0.5
      const dyeMix = fbm(u * 10, v * 10, seed + 21, 3)
      let t = clamp(resisted * 0.85 + stitch * (1 - resisted) * 0.6)
      if (invert) t = 1 - t * 0.9
      const dr = mix(dye[0], dyeLight[0], dyeMix), dg = mix(dye[1], dyeLight[1], dyeMix), db = mix(dye[2], dyeLight[2], dyeMix)
      const i = (y * size + x) * 4
      color[i] = mix(dr, resist[0], t); color[i + 1] = mix(dg, resist[1], t); color[i + 2] = mix(db, resist[2], t); color[i + 3] = 255
      const weave = (Math.sin(x * 1.9) * Math.sin(y * 1.9) * 0.5 + 0.5) * 40 + fbm(u * 40, v * 40, seed + 33, 2) * 60
      height[i] = height[i + 1] = height[i + 2] = 110 + weave; height[i + 3] = 255
    }
  }
  return { color, height }
}

export function genTexture(kind, size, opts) {
  if (kind === 'marble') return genMarble(size, opts)
  if (kind === 'wood') return genWood(size, opts)
  if (kind === 'metal') return genMetal(size, opts)
  if (kind === 'adire') return genAdire(size, opts)
  return genWood(size, opts)
}
