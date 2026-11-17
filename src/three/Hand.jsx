import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createHand } from './hands/ChessHand.js'
import { REST, REST_CURL, SHOULDER, TOTAL, planStep, poseAt } from './hands/HandAnimation.js'

const _v = new THREE.Vector3()

export default function Hands({ active, enabled, events, resetToken, registry, release, onPlace, onBusy, onMate, quality = 'high', speed = 1.4 }) {
  const hands = useMemo(
    () => ({
      w: createHand('#e9e3d4', '#f4efe3', quality),
      b: createHand('#24262c', '#15161a', quality),
    }),
    [quality],
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

  const orient = useRef({
    w: { pitch: 0.3, roll: 0, px: REST.w.x, pz: REST.w.z },
    b: { pitch: 0.3, roll: 0, px: REST.b.x, pz: REST.b.z },
  })
  const clock = useRef(0)

  const applyPose = (side, grp, dt) => {
    const p = pose.current[side]
    const h = hands[side]
    const o = orient.current[side]
    h.setCurl(p.curl, clock.current + (side === 'w' ? 0 : 1.9))
    const [shx, shz] = SHOULDER[side]
    const heading = Math.atan2(p.gx - shx, p.gz - shz)
    // wrist follows the motion: pitches down as the fingers close, rolls slightly into sideways moves
    const vx = (p.gx - o.px) / Math.max(dt, 1e-3)
    const vz = (p.gz - o.pz) / Math.max(dt, 1e-3)
    o.px = p.gx
    o.pz = p.gz
    const lateral = vx * Math.cos(heading) - vz * Math.sin(heading)
    const k = 1 - Math.exp(-dt * 7)
    o.roll += (Math.max(-0.22, Math.min(0.22, -lateral * 0.05)) * (side === 'w' ? -1 : 1) - o.roll) * k
    o.pitch += (0.28 + 0.14 * Math.min(1, p.curl) - o.pitch) * k
    grp.rotation.set(o.pitch, heading, o.roll, 'YXZ')
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
    clock.current += dt
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
      setBusy(false) // hands ease back to rest on their own (see below), never snap
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
          cur.plan = planStep(step, registry.current, cur.ev.captureId)
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

    // a hand with nothing to do (also after a cancelled move) drifts back to its resting spot
    const busySide = st.cur ? st.cur.ev.side : null
    ;['w', 'b'].forEach((sd) => {
      if (sd === busySide) return
      const p = pose.current[sd]
      const k = 1 - Math.exp(-dt * 5)
      p.gx += (REST[sd].x - p.gx) * k
      p.gy += (REST[sd].y - p.gy) * k
      p.gz += (REST[sd].z - p.gz) * k
      p.curl += (REST_CURL - p.curl) * k
    })

    if (wRef.current) applyPose('w', wRef.current, dt)
    if (bRef.current) applyPose('b', bRef.current, dt)
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
