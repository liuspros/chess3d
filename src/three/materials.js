import * as THREE from 'three'
import { genMarble, genWood } from './texgen.js'
import { makeLabelTexture, makeRugTexture, makeBlobTexture, makeGlowTexture } from './textures.js'

export const TIERS = {
  high: { name: 'high', shadows: 2048, dpr: [1, 2], sq: 512, big: 1024, physical: true, env: 256, antialias: true, particles: true, room: 'full', hands: true, bump: true },
  medium: { name: 'medium', shadows: 1024, dpr: [1, 1.5], sq: 256, big: 512, physical: false, env: 128, antialias: true, particles: true, room: 'full', hands: true, bump: true },
  low: { name: 'low', shadows: 0, dpr: [1, 1], sq: 128, big: 128, physical: false, env: 0, antialias: false, particles: false, room: 'lite', hands: false, bump: false },
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
        out[i] = j.kind === 'marble' ? genMarble(j.size, j.opts) : genWood(j.size, j.opts)
      }
      resolve(out)
    }
    const pump = (w) => {
      if (next < jobs.length) {
        const id = next++
        w.postMessage({ id, ...jobs[id] })
      }
    }

    try {
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./texWorker.js', import.meta.url), { type: 'module' })
        w.onmessage = (e) => {
          out[e.data.id] = e.data
          done++
          if (done === jobs.length) finish()
          else pump(w)
        }
        w.onerror = sync
        workers.push(w)
        pump(w)
      }
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

// Builds every texture and material for a quality tier.
export async function buildMaterials(tier) {
  const sq = tier.sq
  const big = tier.big
  const jobs = []
  const add = (key, kind, size, opts) => jobs.push({ key, kind, size, opts })

  ;[1, 2, 3].forEach((i) => add('ml' + i, 'marble', sq, { seed: i * 13, base: [243, 239, 230], vein: [98, 102, 110], strength: 0.85 }))
  ;[1, 2, 3].forEach((i) => add('wd' + i, 'wood', sq, { seed: i * 7, light: [150, 108, 72], dark: [96, 62, 40], rings: 26, stretch: 0.05, pores: 0.14, patch: 0.08 }))
  add('frame', 'wood', sq, { seed: 99, light: [104, 66, 42], dark: [40, 22, 14], rings: 22, stretch: 0.06 })
  add('pieceW', 'marble', sq, { seed: 5, base: [250, 247, 240], vein: [158, 152, 146], strength: 0.55, scale: 1.3 })
  add('pieceB', 'wood', sq, { seed: 21, light: [62, 42, 30], dark: [7, 5, 4], rings: 30, stretch: 0.05, pores: 0.12 })
  add('table', 'wood', big, { seed: 51, light: [112, 74, 46], dark: [52, 30, 18], rings: 16, stretch: 0.07 })
  if (tier.room === 'full') add('floor', 'wood', sq, { seed: 71, light: [150, 112, 76], dark: [92, 62, 40], rings: 12, stretch: 0.1 })

  const res = await runJobs(jobs)
  const R = {}
  jobs.forEach((j, i) => (R[j.key] = res[i]))

  const textures = []
  const track = (t) => {
    textures.push(t)
    return t
  }
  const bump = (key, size, repeat = false) => (tier.bump ? track(dataTex(R[key].height, size, { srgb: false, repeat })) : null)
  const colorTex = (key, size, repeat = false) => track(dataTex(R[key].color, size, { repeat }))

  const mk = (props, coat = 0, coatRough = 0.2) => {
    const p = { ...props }
    if (tier.physical) return new THREE.MeshPhysicalMaterial({ ...p, clearcoat: coat, clearcoatRoughness: coatRough })
    return new THREE.MeshStandardMaterial(p)
  }
  const withBump = (key, size, scale, repeat) => {
    const b = bump(key, size, repeat)
    return b ? { bumpMap: b, bumpScale: scale } : {}
  }

  const squareLight = [1, 2, 3].map((i) =>
    mk({ map: colorTex('ml' + i, sq), roughness: 0.26, ...withBump('ml' + i, sq, 0.35) }, 0.85, 0.08),
  )
  const squareDark = [1, 2, 3].map((i) =>
    mk({ map: colorTex('wd' + i, sq), roughness: 0.42, ...withBump('wd' + i, sq, 0.35) }, 0.45, 0.2),
  )
  const frame = mk({ map: colorTex('frame', sq), roughness: 0.36, ...withBump('frame', sq, 0.35) }, 0.5, 0.15)
  const pieceW = mk({ map: colorTex('pieceW', sq, true), roughness: 0.2, ...withBump('pieceW', sq, 0.25, true) }, 0.8, 0.06)
  const pieceB = mk({ map: colorTex('pieceB', sq, true), roughness: 0.26, ...withBump('pieceB', sq, 0.6, true) }, 0.9, 0.08)

  const tableMap = colorTex('table', big, true)
  tableMap.repeat.set(2, 2)
  const tableBump = bump('table', big, true)
  if (tableBump) tableBump.repeat.set(2, 2)
  const table = mk({ map: tableMap, roughness: 0.38, ...(tableBump ? { bumpMap: tableBump, bumpScale: 0.4 } : {}) }, 0.55, 0.18)

  let floor = null
  let rug = null
  if (tier.room === 'full') {
    const fm = colorTex('floor', sq, true)
    fm.repeat.set(6, 6)
    const fb = bump('floor', sq, true)
    if (fb) fb.repeat.set(6, 6)
    floor = mk({ map: fm, roughness: 0.5, ...(fb ? { bumpMap: fb, bumpScale: 0.4 } : {}) }, 0.3, 0.3)
    const rugTex = track(makeRugTexture())
    rug = new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 })
  } else {
    floor = new THREE.MeshStandardMaterial({ color: '#2a1c12', roughness: 0.7 })
  }

  const slab = new THREE.MeshStandardMaterial({ color: '#1a120d', roughness: 0.8 })
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 0.9, roughness: 0.28 })
  const felt = new THREE.MeshStandardMaterial({ color: '#1f3d2e', roughness: 1 })
  const plaster = new THREE.MeshStandardMaterial({ color: '#7a6552', roughness: 0.95 })

  const labels = {}
  'abcdefgh12345678'.split('').forEach((ch) => {
    const t = track(makeLabelTexture(ch))
    labels[ch] = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })
  })

  const blobTex = track(makeBlobTexture())
  const glowTex = track(makeGlowTexture())

  const materials = { squareLight, squareDark, frame, pieceW, pieceB, table, floor, rug, slab, gold, felt, plaster, labels, blobTex, glowTex }

  const dispose = () => {
    textures.forEach((t) => t.dispose())
    const mats = [...squareLight, ...squareDark, frame, pieceW, pieceB, table, floor, rug, slab, gold, felt, plaster, ...Object.values(labels)]
    mats.forEach((m) => m && m.dispose())
  }
  return { materials, dispose }
}
