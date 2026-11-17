import * as THREE from 'three'
import { BONE_NAMES, FINGERS, THUMB, dirOf, segLen } from './HandAnatomy.js'

/* Builds the bone hierarchy of one hand in its rest pose.
 *   wrist ─┬─ forearm
 *          └─ hand ─┬─ index0 → index1 → index2
 *                   ├─ middle0 … ring0 … pinky0 …
 *                   └─ thumb0 → thumb1 → thumb2
 * Every bone's local +z runs along the bone, local +x is the flexion axis
 * (positive rotation curls the digit towards the palm). */

const UP = new THREE.Vector3(0, 1, 0)

export function frameQuat(dir, roll = 0) {
  const z = new THREE.Vector3(...dir).normalize()
  const y = UP.clone().addScaledVector(z, -UP.dot(z)).normalize()
  y.applyAxisAngle(z, roll)
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

export function buildSkeleton() {
  const bones = {}
  BONE_NAMES.forEach((n) => {
    const b = new THREE.Bone()
    b.name = n
    bones[n] = b
  })
  bones.wrist.add(bones.forearm)
  bones.wrist.add(bones.hand)

  const rest = {} // rest quaternions per bone (local)
  const tips = {}
  ;[...FINGERS, THUMB].forEach((dg) => {
    let prevWorldQ = new THREE.Quaternion()
    let parent = bones.hand
    for (let s = 0; s < 3; s++) {
      const dir = dirOf(dg.J[s], dg.J[s + 1])
      const roll = dg.roll ? dg.roll[s] : 0
      const worldQ = frameQuat(dir, roll)
      const b = bones[`${dg.name}${s}`]
      const local = prevWorldQ.clone().invert().multiply(worldQ)
      b.quaternion.copy(local)
      rest[b.name] = local.clone()
      if (s === 0) b.position.set(...dg.J[0])
      else b.position.set(0, 0, segLen(dg.J[s - 1], dg.J[s]))
      parent.add(b)
      parent = b
      prevWorldQ = worldQ
    }
    const tip = new THREE.Object3D()
    tip.position.set(0, 0, segLen(dg.J[2], dg.J[3]))
    parent.add(tip)
    tips[dg.name] = tip
  })
  rest.hand = new THREE.Quaternion()
  rest.forearm = new THREE.Quaternion()
  bones.wrist.updateMatrixWorld(true)
  return { bones, list: BONE_NAMES.map((n) => bones[n]), rest, tips }
}
