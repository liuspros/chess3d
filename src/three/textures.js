import * as THREE from 'three'

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

// engraved gold coordinate letters for the frame
export function makeLabelTexture(text) {
  const c = canvas(64)
  const ctx = c.getContext('2d')
  ctx.font = '600 40px Georgia, "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#d8b46a'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 3
  ctx.fillText(text, 32, 34)
  return tex(c)
}

// soft contact-shadow blob (black, alpha falloff)
export function makeBlobTexture() {
  const c = canvas(128)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,0.9)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return tex(c, false)
}

// golden glow used under the selected piece
export function makeGlowTexture() {
  const c = canvas(128)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,226,150,0.95)')
  g.addColorStop(0.5, 'rgba(255,200,100,0.45)')
  g.addColorStop(1, 'rgba(255,190,80,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return tex(c)
}

// simple woven-rug pattern
export function makeRugTexture() {
  const W = 384
  const H = 512
  const c = canvas(W, H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#4e1518'
  ctx.fillRect(0, 0, W, H)
  const band = (inset, w, col) => {
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2)
  }
  band(14, 10, '#c9a45c')
  band(34, 4, '#1d0809')
  band(46, 14, '#7a2428')
  band(64, 3, '#c9a45c')
  // medallion lattice
  ctx.save()
  ctx.beginPath()
  ctx.rect(76, 76, W - 152, H - 152)
  ctx.clip()
  ctx.fillStyle = '#3b0f12'
  ctx.fillRect(0, 0, W, H)
  for (let y = 0; y < H; y += 56) {
    for (let x = 0; x < W; x += 56) {
      ctx.fillStyle = (x + y) % 112 === 0 ? '#c9a45c' : '#8a2d31'
      ctx.beginPath()
      ctx.moveTo(x + 28, y + 6)
      ctx.lineTo(x + 50, y + 28)
      ctx.lineTo(x + 28, y + 50)
      ctx.lineTo(x + 6, y + 28)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#1d0809'
      ctx.beginPath()
      ctx.arc(x + 28, y + 28, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
  // weave noise
  const img = ctx.getImageData(0, 0, W, H)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  return tex(c)
}

// wood grain as a CSS background image (UI buttons / panels). Uses the same
// generator as the 3D materials so the UI matches the board.
export async function woodDataURL(opts, size = 192) {
  const { genWood } = await import('./texgen.js')
  const { color } = genWood(size, opts)
  const c = canvas(size)
  c.getContext('2d').putImageData(new ImageData(color, size, size), 0, 0)
  return c.toDataURL('image/jpeg', 0.85)
}
