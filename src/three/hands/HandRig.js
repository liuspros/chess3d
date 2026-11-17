import * as THREE from 'three'
import { FINGERS, THUMB } from './HandAnatomy.js'
import { LIMITS, clamp } from './HandPoses.js'

const _e = new THREE.Euler()
const _q = new THREE.Quaternion()

/** Applies a pose to a skeleton built by buildSkeleton(), respecting joint limits. */
export function applyPose(skel, pose) {
  const { bones, rest } = skel
  const set = (name, x, y = 0, z = 0) => {
    _e.set(x, y, z, 'YXZ')
    _q.setFromEuler(_e)
    bones[name].quaternion.copy(rest[name]).multiply(_q)
  }
  FINGERS.forEach((f, i) => {
    const p = pose.f[i]
    set(`${f.name}0`, clamp(p.mcp, LIMITS.mcp), clamp(p.spread, LIMITS.spread))
    const pip = clamp(p.pip, LIMITS.pip)
    set(`${f.name}1`, pip)
    // the distal joint follows the proximal one a little (tendon coupling), but never past its limit
    set(`${f.name}2`, clamp(p.dip + pip * 0.12, LIMITS.dip))
  })
  const t = pose.t
  set(`${THUMB.name}0`, clamp(t.flex, LIMITS.tFlex), clamp(t.abd, LIMITS.tAbd), clamp(t.roll, LIMITS.tRoll))
  set(`${THUMB.name}1`, clamp(t.mcp, LIMITS.tMcp))
  set(`${THUMB.name}2`, clamp(t.ip, LIMITS.tIp))
  const w = pose.w
  _e.set(clamp(w.flex, LIMITS.wFlex), clamp(w.dev, LIMITS.wDev), clamp(w.roll, LIMITS.wRoll), 'YXZ')
  bones.hand.quaternion.setFromEuler(_e)
}
