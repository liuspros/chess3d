import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PIECE_H } from './pieceGeometry.js'
import { squarePos } from './coords.js'

/* ------------------------------------------------------------------ */
/* Procedural hand                                                      */
/* ------------------------------------------------------------------ */
// Local axes: +z = fingers, +y = up, palm faces down, thumb on -x (right hand).

const FINGERS = [
  // x (across palm), lengths, radii, open angles, closed angles
  { x: -0.28, len: [0.4, 0.24, 0.19], rad: [0.082, 0.072, 0.064], open: [0.08, 0.1, 0.05], closed: [0.85, 1.0, 0.7], yaw: -0.04 },
  { x: -0.09, len: [0.44, 0.27, 0.2], rad: [0.084, 0.074, 0.066], open: [0.08, 0.1, 0.05], closed: [0.95, 1.1, 0.8], yaw: 0 },
  { x: 0.1, len: [0.4, 0.25, 0.19], rad: [0.08, 0.07, 0.062], open: [0.1, 0.12, 0.06], closed: [1.25, 1.35, 0.95], yaw: 0.04 },
  { x: 0.28, len: [0.31, 0.19, 0.16], rad: [0.07, 0.062, 0.055], open: [0.12, 0.14, 0.06], closed: [1.3, 1.4, 1.0], yaw: 0.09 },
]

function skinMat() {
  return new THREE.MeshStandardMaterial({ color: '#d8a07c', roughness: 0.55, metalness: 0 })
}

function segment(L, r, mat) {
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, L - 2 * r), 4, 12)
  geo.rotateX(Math.PI / 2)
  geo.translate(0, 0, L / 2)
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  return m
}

function chain(lens, rads, mat) {
  const joints = []
  let parent = null
  const root = new THREE.Group()
  lens.forEach((L, i) => {
    const j = new THREE.Group()
    if (i > 0) j.position.z = lens[i - 1]
    j.add(segment(L, rads[i], mat))
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(rads[i] * 1.02, 12, 10), mat)
    knuckle.castShadow = true
    j.add(knuckle)
    ;(parent || root).add(j)
    parent = j
    joints.push(j)
  })
  const tip = new THREE.Object3D()
  tip.position.z = lens[lens.length - 1]
  parent.add(tip)
  return { root, joints, tip }
}

export function createHand(sleeveColor, cuffColor) {
  const skin = skinMat()
  const sleeve = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.85, vertexColors: true, transparent: true })
  const cuff = new THREE.MeshStandardMaterial({ color: cuffColor, roughness: 0.6 })
  const root = new THREE.Group()
  const hand = new THREE.Group() // everything that curls lives here
  root.add(hand)

  // palm
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.2, 0.98, 4, 0.08), skin)
  palm.position.set(0, 0, 0.49)
  palm.castShadow = true
  hand.add(palm)
  // tapered back of hand toward wrist
  const wristBlock = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.22, 0.4, 4, 0.09), skin)
  wristBlock.position.set(0, 0, 0.05)
  wristBlock.castShadow = true
  hand.add(wristBlock)

  // fingers
  const fingers = FINGERS.map((f) => {
    const c = chain(f.len, f.rad, skin)
    c.root.position.set(f.x, 0, 0.98)
    c.root.rotation.y = f.yaw
    hand.add(c.root)
    return { ...f, ...c }
  })

  // thumb
  const thumbDef = { len: [0.34, 0.3, 0.22], rad: [0.1, 0.085, 0.074], open: [0.05, 0.12, 0.08], closed: [0.7, 0.55, 0.45] }
  const th = chain(thumbDef.len, thumbDef.rad, skin)
  th.root.position.set(-0.44, -0.04, 0.22)
  th.root.rotation.y = -0.6
  hand.add(th.root)

  // forearm (skin, short) + sleeve (long) sloping up and back
  const arm = new THREE.Group()
  arm.rotation.x = 0.16
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 1.3, 20), skin)
  fore.rotation.x = Math.PI / 2
  fore.position.z = -0.6
  fore.castShadow = true
  arm.add(fore)
  const cuffM = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.41, 0.42, 24), cuff)
  cuffM.rotation.x = Math.PI / 2
  cuffM.position.z = -1.3
  cuffM.castShadow = true
  arm.add(cuffM)
  const sleeveG = new THREE.CylinderGeometry(0.46, 0.56, 6.5, 24)
  {
    // fade the sleeve out towards the shoulder so the arm never ends in a visible cut
    const pos = sleeveG.attributes.position
    const col = new Float32Array(pos.count * 4)
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) + 3.25) / 4.2)) // 0 far end .. 1 near wrist
      const a = t * t * (3 - 2 * t)
      col.set([1, 1, 1, a], i * 4)
    }
    sleeveG.setAttribute('color', new THREE.BufferAttribute(col, 4))
  }
  const sleeveM = new THREE.Mesh(sleeveG, sleeve)
  sleeveM.rotation.x = Math.PI / 2
  sleeveM.position.z = -4.2
  sleeveM.castShadow = false
  arm.add(sleeveM)
  root.add(arm)

  const setCurl = (c) => {
    fingers.forEach((f) => f.joints.forEach((j, i) => (j.rotation.x = f.open[i] + c * (f.closed[i] - f.open[i]))))
    th.joints.forEach((j, i) => (j.rotation.x = thumbDef.open[i] + c * (thumbDef.closed[i] - thumbDef.open[i])))
    th.root.rotation.y = -0.6 + c * 0.95
    th.root.rotation.z = c * -0.25
  }

  // where thumb & index tips meet when fully closed = the "grip point"
  setCurl(1)
  root.updateMatrixWorld(true)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  th.tip.getWorldPosition(a)
  fingers[0].tip.getWorldPosition(b)
  const grip = a.add(b).multiplyScalar(0.5)
  setCurl(0.2)

  const dispose = () => {
    root.traverse((o) => o.geometry && o.geometry.dispose())
    skin.dispose()
    sleeve.dispose()
    cuff.dispose()
  }
  return { root, setCurl, grip, dispose }
}

/* ------------------------------------------------------------------ */
/* Choreography                                                         */
/* ------------------------------------------------------------------ */
const GRIP_FRAC = 0.78
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
const lerp = (a, b, t) => a + (b - a) * t
const seg = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)))

const REST = {
  w: { x: 5.0, y: 0.7, z: 6.3 },
  b: { x: -5.0, y: 0.7, z: -6.3 },
}
const SHOULDER = { w: [2, 15], b: [-2, -15] }
const TOTAL = 2.7

function planStep(step, mover, reg, captureId) {
  const [sx, , sz] = squarePos(step.from)
  const [tx, , tz] = squarePos(step.to)
  const h = PIECE_H[step.type] || 1
  const gripY = h * GRIP_FRAC
  // is the straight path blocked by another piece?
  let blocked = false
  reg.forEach((api, id) => {
    if (id === step.pieceId || id === captureId) return
    const p = api.group.position
    if (p.y > 0.4) return
    for (let i = 1; i < 12; i++) {
      const t = i / 12
      const x = lerp(sx, tx, t)
      const z = lerp(sz, tz, t)
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.5) blocked = true
    }
  })
  const lift = step.type === 'n' ? 1.25 : blocked ? 1.75 : 0.45
  return { sx, sz, tx, tz, gripY, lift }
}

function poseAt(u, plan, side) {
  const { sx, sz, tx, tz, gripY, lift } = plan
  const R = REST[side]
  const hoverY = gripY + 1.3
  let gx
  let gy
  let gz
  let curl
  let base // piece base height while carried
  if (u < 0.45) {
    const k = ease(seg(u, 0, 0.45))
    gx = lerp(R.x, sx, k)
    gz = lerp(R.z, sz, k)
    gy = lerp(R.y, hoverY, k)
    curl = 0.15 * (1 - k) + 0.05 * k
    base = 0
  } else if (u < 0.75) {
    const k = ease(seg(u, 0.45, 0.75))
    gx = sx
    gz = sz
    gy = lerp(hoverY, gripY, k)
    curl = 0.05
    base = 0
  } else if (u < 0.9) {
    const k = seg(u, 0.75, 0.9)
    gx = sx
    gz = sz
    gy = gripY
    curl = lerp(0.05, 1, k)
    base = 0
  } else if (u < 1.1) {
    const k = ease(seg(u, 0.9, 1.1))
    gx = sx
    gz = sz
    base = lift * k
    gy = gripY + base
    curl = 1
  } else if (u < 1.6) {
    const k = ease(seg(u, 1.1, 1.6))
    gx = lerp(sx, tx, k)
    gz = lerp(sz, tz, k)
    base = lift + 0.12 * Math.sin(Math.PI * k)
    gy = gripY + base
    curl = 1
  } else if (u < 1.8) {
    const k = ease(seg(u, 1.6, 1.8))
    gx = tx
    gz = tz
    base = lift * (1 - k)
    gy = gripY + base
    curl = 1
  } else if (u < 1.95) {
    const k = seg(u, 1.8, 1.95)
    gx = tx
    gz = tz
    gy = gripY
    curl = lerp(1, 0.05, k)
    base = 0
  } else if (u < 2.2) {
    const k = ease(seg(u, 1.95, 2.2))
    gx = tx
    gz = tz
    gy = lerp(gripY, hoverY, k)
    curl = 0.05
    base = 0
  } else {
    const k = ease(seg(u, 2.2, TOTAL))
    gx = lerp(tx, R.x, k)
    gz = lerp(tz, R.z, k)
    gy = lerp(hoverY, R.y, k)
    curl = lerp(0.05, 0.15, k)
    base = 0
  }
  return { gx, gy, gz, curl, base }
}

const _v = new THREE.Vector3()

export default function Hands({ active, enabled, events, resetToken, registry, release, onPlace, onBusy, onMate, speed = 1.4 }) {
  const hands = useMemo(
    () => ({
      w: createHand('#e9e3d4', '#f4efe3'),
      b: createHand('#24262c', '#15161a'),
    }),
    [],
  )
  useEffect(() => () => Object.values(hands).forEach((h) => h.dispose()), [hands])

  const wRef = useRef()
  const bRef = useRef()
  const state = useRef({ processed: 0, queue: [], cur: null, reset: resetToken, busy: false })
  const pose = useRef({
    w: { gx: REST.w.x, gy: REST.w.y, gz: REST.w.z, curl: 0.15 },
    b: { gx: REST.b.x, gy: REST.b.y, gz: REST.b.z, curl: 0.15 },
  })

  const setBusy = (v) => {
    if (state.current.busy !== v) {
      state.current.busy = v
      onBusy?.(v)
    }
  }

  const applyPose = (side, grp) => {
    const p = pose.current[side]
    const h = hands[side]
    h.setCurl(p.curl)
    const [shx, shz] = SHOULDER[side]
    const heading = Math.atan2(p.gx - shx, p.gz - shz)
    grp.rotation.set(0.3, heading, 0, 'YXZ')
    grp.scale.set(side === 'w' ? -1 : 1, 1, 1)
    grp.position.set(p.gx, p.gy, p.gz)
    grp.updateMatrixWorld(true)
    _v.copy(h.grip)
    grp.localToWorld(_v)
    grp.position.x += p.gx - _v.x
    grp.position.y += p.gy - _v.y
    grp.position.z += p.gz - _v.z
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const st = state.current

    // reset (new game / undo / sync): drop everything
    if (st.reset !== resetToken) {
      st.reset = resetToken
      st.queue = []
      if (st.cur) {
        st.cur.holds.forEach((id) => release(id))
        st.cur = null
      }
      st.processed = events.length
      setBusy(false)
      pose.current.w = { gx: REST.w.x, gy: REST.w.y, gz: REST.w.z, curl: 0.15 }
      pose.current.b = { gx: REST.b.x, gy: REST.b.y, gz: REST.b.z, curl: 0.15 }
    }

    // ingest new events
    while (st.processed < events.length) {
      const ev = events[st.processed++]
      if (!enabled) {
        onPlace?.(ev, true)
        if (ev.mate) onMate?.(ev)
      } else {
        st.queue.push(ev)
      }
    }

    if (enabled) {
      if (!st.cur && st.queue.length) {
        const ev = st.queue.shift()
        const holds = []
        ev.steps.forEach((s) => holds.push(s.pieceId))
        if (ev.captureId) holds.push(ev.captureId)
        st.cur = { ev, holds, step: 0, u: 0, plan: null, placed: false, capReleased: false }
        setBusy(true)
      }

      const cur = st.cur
      if (cur) {
        const spd = st.queue.length > 0 ? 2.6 : speed
        cur.u += dt * spd
        const step = cur.ev.steps[cur.step]
        const api = registry.current.get(step.pieceId)
        if (!cur.plan) {
          cur.plan = planStep(step, cur.ev.side, registry.current, cur.ev.captureId)
          // start from where the piece really is
          if (api) {
            cur.plan.sx = api.group.position.x
            cur.plan.sz = api.group.position.z
          }
        }
        const side = cur.ev.side
        const p = poseAt(cur.u, cur.plan, side)
        pose.current[side] = { gx: p.gx, gy: p.gy, gz: p.gz, curl: p.curl }

        // carry the piece with the hand
        if (api && cur.u >= 0.75 && cur.u < 1.8) {
          api.group.position.set(p.gx, p.base, p.gz)
        } else if (api && cur.u >= 1.8) {
          api.group.position.set(cur.plan.tx, 0, cur.plan.tz)
        }

        // piece set down
        if (cur.u >= 1.8 && !cur.placed) {
          cur.placed = true
          if (cur.step === 0) onPlace?.(cur.ev, false)
        }
        // captured piece leaves just as the hand lets go
        if (cur.step === 0 && cur.u >= 1.75 && !cur.capReleased && cur.ev.captureId) {
          cur.capReleased = true
          release(cur.ev.captureId)
        }

        const stepDone = cur.step < cur.ev.steps.length - 1 ? cur.u >= 2.05 : cur.u >= TOTAL
        if (stepDone) {
          if (cur.step < cur.ev.steps.length - 1) {
            cur.step++
            cur.u = 0
            cur.plan = null
            cur.placed = false
          } else {
            cur.holds.forEach((id) => release(id))
            if (cur.ev.mate) onMate?.(cur.ev)
            st.cur = null
            if (!st.queue.length) setBusy(false)
          }
        }
      }
    }

    if (wRef.current) applyPose('w', wRef.current)
    if (bRef.current) applyPose('b', bRef.current)
  })

  return (
    <group visible={!!active}>
      <group ref={wRef}>
        <primitive object={hands.w.root} />
      </group>
      <group ref={bRef}>
        <primitive object={hands.b.root} />
      </group>
    </group>
  )
}
