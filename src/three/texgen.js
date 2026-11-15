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
