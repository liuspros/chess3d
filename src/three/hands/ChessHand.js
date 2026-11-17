import * as THREE from 'three'
import { buildBody } from './HandGeometry.js'
import { buildNails } from './Fingernails.js'
import { buildSkeleton } from './HandSkeleton.js'
import { applyPose } from './HandRig.js'
import { poseFromCurl } from './HandPoses.js'
import { createNailMaterial, createSkinMaterial } from './HandMaterials.js'
import { createCuffGeometry, createFabricMaterial, createSleeveGeometry } from './Sleeve.js'

/* quality tiers: surface-net cell size, skin shader level, shadow receiving */
export const HAND_QUALITY = {
  high: { res: 0.0215, shader: 2, nails: true, receive: true },
  medium: { res: 0.03, shader: 1, nails: true, receive: false },
  low: { res: 0.04, shader: 1, nails: true, receive: false },
}

/* geometry + materials are built once and shared by both hands (refcounted so they are
 * disposed when the last hand goes away) */
const cache = new Map()
function acquire(q) {
  let e = cache.get(q)
  if (!e) {
    const cfg = HAND_QUALITY[q] || HAND_QUALITY.medium
    const body = buildBody(cfg.res)
    e = {
      refs: 0,
      cfg,
      body: body.geometry,
      nails: buildNails(body),
      skin: createSkinMaterial({ quality: cfg.shader }),
      nailMat: createNailMaterial(),
      sleeveGeo: createSleeveGeometry(),
      cuffGeo: createCuffGeometry(),
    }
    cache.set(q, e)
  }
  e.refs++
  return e
}
function release(q) {
  const e = cache.get(q)
  if (!e || --e.refs > 0) return
  ;[e.body, e.nails, e.sleeveGeo, e.cuffGeo].forEach((g) => g.dispose())
  e.skin.dispose()
  e.nailMat.dispose()
  cache.delete(q)
}

/**
 * One fully rigged hand + forearm + sleeve.
 * Returns { root, setCurl(c, t), setPose(pose), grip, skeleton, dispose }.
 * `grip` is the point between thumb and finger pads when the hand closes (in root space).
 */
export function createHand(sleeveColor, cuffColor, quality = 'high') {
  const a = acquire(quality)
  const skel = buildSkeleton()
  const root = new THREE.Group()
  root.add(skel.bones.wrist)

  const skeleton = new THREE.Skeleton(skel.list)
  const body = new THREE.SkinnedMesh(a.body, a.skin)
  body.frustumCulled = false
  body.castShadow = true
  body.receiveShadow = a.cfg.receive
  root.add(body)
  body.bind(skeleton)

  if (a.cfg.nails) {
    const nails = new THREE.SkinnedMesh(a.nails, a.nailMat)
    nails.frustumCulled = false
    nails.castShadow = false
    root.add(nails)
    nails.bind(skeleton)
  }

  // sleeve + cuff ride on the forearm bone (which carries the natural downward slope of the arm)
  const sleeveMat = createFabricMaterial(sleeveColor, { vertexColors: true, transparent: true })
  const cuffMat = createFabricMaterial(cuffColor, { rough: 0.7, sheen: 0.4 })
  const sleeve = new THREE.Mesh(a.sleeveGeo, sleeveMat)
  sleeve.rotation.x = Math.PI / 2
  sleeve.position.z = -4.2
  const cuff = new THREE.Mesh(a.cuffGeo, cuffMat)
  cuff.rotation.x = Math.PI / 2
  cuff.position.z = -1.3
  cuff.castShadow = true
  skel.bones.forearm.add(sleeve, cuff)
  skel.bones.forearm.rotation.x = 0.16

  let pose = null
  const setCurl = (c, t = 0) => {
    pose = poseFromCurl(c, t, pose || undefined)
    applyPose(skel, pose)
  }
  const setPose = (p) => applyPose(skel, p)

  // grip point: thumb pad against index + middle pads in the closed pose
  setCurl(1, 0)
  root.updateMatrixWorld(true)
  const th = new THREE.Vector3()
  const ix = new THREE.Vector3()
  const md = new THREE.Vector3()
  skel.tips.thumb.getWorldPosition(th)
  skel.tips.index.getWorldPosition(ix)
  skel.tips.middle.getWorldPosition(md)
  const grip = th.add(ix.add(md).multiplyScalar(0.5)).multiplyScalar(0.5)
  setCurl(0.15, 0)

  const dispose = () => {
    sleeveMat.dispose()
    cuffMat.dispose()
    skeleton.dispose()
    release(quality)
  }
  return { root, setCurl, setPose, grip, skeleton, tips: skel.tips, dispose, bones: skel.bones }
}
