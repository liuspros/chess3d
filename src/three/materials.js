import * as THREE from 'three'
import { genTexture } from './texgen.js'
import { BOARD_THEMES, PIECE_THEMES } from './themes.js'
import { makeLabelTexture, makeRugTexture, makeBlobTexture, makeGlowTexture } from './textures.js'

export const TIERS = {
  high: { name: 'high', seg: 48, shadows: 2048, dpr: [1, 2], sq: 512, big: 1024, physical: true, env: 256, antialias: true, particles: true, room: 'full', hands: true, bump: true },
  medium: { name: 'medium', seg: 40, shadows: 1024, dpr: [1, 1.5], sq: 256, big: 512, physical: false, env: 128, antialias: true, particles: true, room: 'full', hands: true, bump: true },
  low: { name: 'low', fps: 30, seg: 24, shadows: 0, dpr: [0.75, 1], sq: 128, big: 128, physical: false, env: 0, antialias: false, particles: false, room: 'lite', hands: false, bump: false },
}

// ---------- texture generation in a worker pool (falls back to main thread) ----------
function runJobs(jobs) {
  return new Promise((resolve) => {
    const out = new Array(jobs.length)
    let next = 0
    let done = 0
    const workers = []
    let failed = false

    const finish = () => {
      workers.forEach((w) => w.terminate())
      resolve(out)
    }
    const sync = () => {
      if (failed) return
      failed = true
      workers.forEach((w) => w.terminate())
      for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i]
        out[i] = genTexture(j.kind, j.size, j.opts)
      }
      resolve(out)
    }

    try {
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./texWorker.js', import.meta.url), { type: 'module' })
        w.onmessage = (e) => {
          out[e.data.id] = e.data
          done++
          if (done === jobs.length) finish()
        }
        w.onerror = (ev) => {
          console.error('texture worker error', ev.message)
          sync()
        }
        workers.push(w)
      }
      // hand every job over up front (no round trips through a busy main thread)
      jobs.forEach((j, id) => workers[id % workers.length].postMessage({ id, ...j }))
    } catch {
      sync()
    }
  })
}

function dataTex(arr, size, { srgb = true, repeat = false } = {}) {
  const t = new THREE.DataTexture(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), size, size, THREE.RGBAFormat)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
  }
  t.needsUpdate = true
  return t
}

// Material factory shared by the room and the themes.
function kit(tier, R, textures) {
  const track = (t) => {
    textures.push(t)
    return t
  }
  const bump = (key, size, repeat = false) => (tier.bump ? track(dataTex(R[key].height, size, { srgb: false, repeat })) : null)
  const colorTex = (key, size, repeat = false) => track(dataTex(R[key].color, size, { repeat }))
  // metals need an environment map; on the lightest tier fake it with a little less metalness
  const fix = (p) => {
    const q = { ...p }
    if (!tier.env && q.metalness) q.metalness = Math.min(q.metalness, 0.3)
    if (!tier.physical) {
      delete q.transmission
      delete q.thickness
      delete q.ior
    }
    return q
  }
  const mk = (props, extra = {}) => {
    const p = fix({ ...props, ...extra })
    if (tier.physical) return new THREE.MeshPhysicalMaterial({ clearcoat: 0, ...p })
    delete p.clearcoat
    delete p.clearcoatRoughness
    return new THREE.MeshStandardMaterial(p)
  }
  const withBump = (key, size, scale, repeat) => {
    const b = bump(key, size, repeat)
    return b ? { bumpMap: b, bumpScale: scale } : {}
  }
  return { track, bump, colorTex, mk, withBump }
}

// Textures + materials that depend on the chosen board and piece set.
export async function buildTheme(tier, boardId = 'board_classic', setId = 'set_classic') {
  const B = BOARD_THEMES[boardId] || BOARD_THEMES.board_classic
  const P = PIECE_THEMES[setId] || PIECE_THEMES.set_classic
  const sq = tier.sq
  const jobs = []
  const add = (key, t, size, seed) => jobs.push({ key, kind: t.kind, size, opts: { seed, ...t.opts } })
  ;[1, 2, 3].forEach((i) => add('l' + i, B.light, sq, B.light.opts.seed ?? i * 13))
  ;[1, 2, 3].forEach((i) => add('d' + i, B.dark, sq, B.dark.opts.seed ?? i * 7))
  add('frame', B.frame, sq, B.frame.opts.seed ?? 99)
  add('pw', P.white, sq, P.white.opts.seed ?? 5)
  add('pb', P.black, sq, P.black.opts.seed ?? 21)
  const res = await runJobs(jobs)
  const R = {}
  jobs.forEach((j, i) => (R[j.key] = res[i]))
  const textures = []
  const { colorTex, mk, withBump } = kit(tier, R, textures)
  const bs = B.bump ?? 0.35

  const squareLight = [1, 2, 3].map((i) => mk({ map: colorTex('l' + i, sq), roughness: 0.3, ...withBump('l' + i, sq, bs) }, B.lightMat))
  const squareDark = [1, 2, 3].map((i) => mk({ map: colorTex('d' + i, sq), roughness: 0.4, ...withBump('d' + i, sq, bs) }, B.darkMat))
  const frame = mk({ map: colorTex('frame', sq), roughness: 0.36, ...withBump('frame', sq, 0.35) }, B.frameMat)
  const pieceW = mk({ map: colorTex('pw', sq, true), roughness: 0.2, ...withBump('pw', sq, 0.25, true) }, P.whiteMat)
  const pieceB = mk({ map: colorTex('pb', sq, true), roughness: 0.26, ...withBump('pb', sq, 0.5, true) }, P.blackMat)
  const gold = new THREE.MeshStandardMaterial({ color: B.trim || '#c9a45c', metalness: tier.env ? 0.9 : 0.3, roughness: 0.28 })

  const theme = { squareLight, squareDark, frame, pieceW, pieceB, gold, pieceStyle: P.style }
  const dispose = () => {
    textures.forEach((t) => t.dispose())
    ;[...squareLight, ...squareDark, frame, pieceW, pieceB, gold].forEach((m) => m.dispose())
  }
  return { theme, dispose }
}

// Room, table, labels and the rest (independent of the theme).
export async function buildMaterials(tier) {
  const sq = tier.sq
  const big = tier.big
  const jobs = []
  const add = (key, kind, size, opts) => jobs.push({ key, kind, size, opts })
  add('table', 'wood', big, { seed: 51, light: [112, 74, 46], dark: [52, 30, 18], rings: 16, stretch: 0.07 })
  if (tier.room === 'full') add('floor', 'wood', sq, { seed: 71, light: [150, 112, 76], dark: [92, 62, 40], rings: 12, stretch: 0.1 })
  const res = await runJobs(jobs)
  const R = {}
  jobs.forEach((j, i) => (R[j.key] = res[i]))

  const textures = []
  const { track, bump, colorTex, mk } = kit(tier, R, textures)

  const tableMap = colorTex('table', big, true)
  tableMap.repeat.set(2, 2)
  const tableBump = bump('table', big, true)
  if (tableBump) tableBump.repeat.set(2, 2)
  const table = mk({ map: tableMap, roughness: 0.38, ...(tableBump ? { bumpMap: tableBump, bumpScale: 0.4 } : {}) }, { clearcoat: 0.55, clearcoatRoughness: 0.18 })

  let floor = null
  let rug = null
  if (tier.room === 'full') {
    const fm = colorTex('floor', sq, true)
    fm.repeat.set(6, 6)
    const fb = bump('floor', sq, true)
    if (fb) fb.repeat.set(6, 6)
    floor = mk({ map: fm, roughness: 0.5, ...(fb ? { bumpMap: fb, bumpScale: 0.4 } : {}) }, { clearcoat: 0.3, clearcoatRoughness: 0.3 })
    const rugTex = track(makeRugTexture())
    rug = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 })
  } else {
    floor = new THREE.MeshStandardMaterial({ color: '#2a1c12', roughness: 0.7 })
  }

  const slab = new THREE.MeshStandardMaterial({ color: '#1a120d', roughness: 0.8 })
  const felt = new THREE.MeshStandardMaterial({ color: '#1f3d2e', roughness: 1 })
  const plaster = new THREE.MeshStandardMaterial({ color: '#7a6552', roughness: 0.95 })

  const labels = {}
  'abcdefgh12345678'.split('').forEach((ch) => {
    const t = track(makeLabelTexture(ch))
    labels[ch] = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })
  })

  const blobTex = track(makeBlobTexture())
  const glowTex = track(makeGlowTexture())

  const materials = { table, floor, rug, slab, felt, plaster, labels, blobTex, glowTex }
  const dispose = () => {
    textures.forEach((t) => t.dispose())
    ;[table, floor, rug, slab, felt, plaster, ...Object.values(labels)].forEach((m) => m && m.dispose())
  }
  return { materials, dispose }
}
