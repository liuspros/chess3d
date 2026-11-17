import * as THREE from 'three'

/* Shirt cuff and jacket sleeve with believable fabric: the cloth bunches into folds that
 * grow stronger towards the cuff, a seam rolls around the opening, and a fine weave bump
 * keeps it from looking like plastic. Colour fades towards the shoulder (vertex alpha) so
 * the sleeve never ends in a visible cut. */

const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}
const noise1 = (x) => {
  const i = Math.floor(x)
  const f = x - i
  const t = f * f * (3 - 2 * f)
  return hash(i) * (1 - t) + hash(i + 1) * t
}

export function createSleeveGeometry(radial = 40, rows = 90) {
  const g = new THREE.CylinderGeometry(0.46, 0.56, 6.5, radial, rows, true)
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 4)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ang = Math.atan2(z, x)
    const t = Math.min(1, Math.max(0, (y + 3.25) / 4.2)) // 0 far end .. 1 near the wrist
    const near = Math.max(0, (y - 1.9) / 1.35) // 0..1 within the last ~1.3 units before the opening
    // long soft folds running along the arm + compressed wrinkles bunching at the opening
    const longFold = Math.sin(ang * 5 + noise1(y * 0.9 + ang) * 2.2) * 0.012 + Math.sin(ang * 9 - y * 1.4) * 0.006
    const bunch = Math.sin(y * 34 + noise1(ang * 3) * 4) * 0.012 * near * near + Math.sin(y * 17 + ang * 3) * 0.01 * near
    const flare = near > 0.85 ? (near - 0.85) * 0.12 : 0 // opening is a little wider
    const r = Math.hypot(x, z) + (longFold * (0.5 + 0.9 * near) + bunch + flare) * (0.4 + t)
    pos.setX(i, Math.cos(ang) * r)
    pos.setZ(i, Math.sin(ang) * r)
    const a = t * t * (3 - 2 * t)
    col.set([1, 1, 1, a], i * 4)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4))
  g.computeVertexNormals()
  return g
}

export function createCuffGeometry() {
  // cuff band with rounded rims and a slight crease where it meets the sleeve
  const prof = []
  const L = 0.42
  const R = 0.4
  prof.push(new THREE.Vector2(R - 0.012, -L / 2))
  prof.push(new THREE.Vector2(R + 0.004, -L / 2 + 0.008))
  prof.push(new THREE.Vector2(R + 0.012, -L / 2 + 0.03))
  for (let i = 0; i <= 8; i++) prof.push(new THREE.Vector2(R + 0.012 + Math.sin(i * 0.8) * 0.002, -L / 2 + 0.05 + (i / 8) * (L - 0.1)))
  prof.push(new THREE.Vector2(R + 0.012, L / 2 - 0.03))
  prof.push(new THREE.Vector2(R + 0.004, L / 2 - 0.008))
  prof.push(new THREE.Vector2(R - 0.012, L / 2))
  return new THREE.LatheGeometry(prof, 56)
}

// weave + soft fuzz so fabric reads as cloth
export function createFabricMaterial(color, { rough = 0.88, sheen = 0.3, vertexColors = false, transparent = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, sheen, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.12), vertexColors, transparent, side: THREE.DoubleSide })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec3 vFabP;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFabP = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vFabP;\nvoid main() {')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float wv = sin(vFabP.y * 520.0) * sin(atan(vFabP.z, vFabP.x) * 360.0);
          float h = wv * 0.0004;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          float lod = 1.0 - smoothstep(0.0, 0.01, length(fwidth(vFabP)) * 2.0);
          vec3 g = sign(det) * (dFdx(h) * lod * r1 + dFdy(h) * lod * r2);
          normal = normalize(abs(det) * normal - g);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'fabric'
  return m
}
