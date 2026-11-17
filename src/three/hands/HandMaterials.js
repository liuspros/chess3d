import * as THREE from 'three'
import { FRAG_AO, FRAG_COLOR, FRAG_HEAD, FRAG_NORMAL, FRAG_ROUGH, FRAG_SSS, VERT_BODY, VERT_HEAD } from './SkinShaders.js'

/** Skin: physically based, with procedural pores / creases / veins and a subsurface approximation. */
export function createSkinMaterial({ tone = '#c48660', quality = 2 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.56,
    metalness: 0,
    ior: 1.4,
    specularIntensity: 0.4,
    sheen: quality > 1 ? 0.25 : 0,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color('#ffd9c4'),
    clearcoat: quality > 1 ? 0.06 : 0,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.6,
  })
  const uniforms = {
    uSkin: { value: new THREE.Color(tone) },
    uBump: { value: quality > 1 ? 0.0024 : 0.002 },
    uSss: { value: 0.65 },
  }
  m.defines = { ...(m.defines || {}), SKIN_Q: quality }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('void main() {', `${VERT_HEAD}\nvoid main() {`).replace('#include <begin_vertex>', VERT_BODY)
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${FRAG_HEAD}\nvoid main() {`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <lights_fragment_end>', FRAG_SSS)
      .replace('#include <aomap_fragment>', FRAG_AO)
  }
  m.customProgramCacheKey = () => `skin-${quality}`
  m.userData.uniforms = uniforms
  return m
}

/** Fingernails: glossy keratin plate; colour (nail bed, lunula, free edge) comes from vertex colours. */
export function createNailMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
    specularIntensity: 0.9,
    ior: 1.5,
    sheen: 0.2,
    sheenColor: new THREE.Color('#ffd2c8'),
    envMapIntensity: 1.1,
  })
}
