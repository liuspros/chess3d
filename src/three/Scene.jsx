import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { createPieceGeometries, disposeGeometries } from './pieceGeometry.js'
import { FILES, RANKS, squarePos } from './coords.js'
import { Room, Table, Trays, trayPos } from './Room.jsx'
import Hands from './Hand.jsx'

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const noRaycast = () => null

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */
function Board({ mats, onSquare, shadows }) {
  const squares = useMemo(() => {
    const out = []
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const sq = FILES[f] + RANKS[r]
        out.push({ sq, light: (f + r) % 2 === 1, variant: (f * 3 + r * 5) % 3, pos: squarePos(sq) })
      }
    }
    return out
  }, [])
  const setCursor = (v) => {
    document.body.style.cursor = v
  }
  return (
    <group>
      {squares.map((s) => (
        <mesh
          key={s.sq}
          position={[s.pos[0], -0.06, s.pos[2]]}
          material={s.light ? mats.squareLight[s.variant] : mats.squareDark[s.variant]}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation()
            onSquare(s.sq)
          }}
          onPointerOver={() => setCursor('pointer')}
          onPointerOut={() => setCursor('auto')}
        >
          <boxGeometry args={[1, 0.12, 1]} />
        </mesh>
      ))}
      <mesh position={[0, -0.2, 0]} material={mats.slab}>
        <boxGeometry args={[8, 0.16, 8]} />
      </mesh>

      {[
        [0, 4.4, 9.6, 0.8, true],
        [0, -4.4, 9.6, 0.8, true],
        [-4.4, 0, 0.8, 8, false],
        [4.4, 0, 0.8, 8, false],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, -0.13, z]} material={mats.frame} castShadow={shadows} receiveShadow>
          <boxGeometry args={[w, 0.34, d]} />
        </mesh>
      ))}

      {[[4.03, 8.08, true], [-4.03, 8.08, true]].map(([z, w], i) => (
        <mesh key={'gh' + i} position={[0, 0.043, z]} material={mats.gold}>
          <boxGeometry args={[w, 0.02, 0.05]} />
        </mesh>
      ))}
      {[-4.03, 4.03].map((x, i) => (
        <mesh key={'gv' + i} position={[x, 0.043, 0]} material={mats.gold}>
          <boxGeometry args={[0.05, 0.02, 8.0]} />
        </mesh>
      ))}

      {FILES.split('').map((ch, i) => (
        <group key={'f' + ch}>
          <mesh position={[i - 3.5, 0.047, 4.42]} rotation={[-Math.PI / 2, 0, 0]} material={mats.labels[ch]}>
            <planeGeometry args={[0.4, 0.4]} />
          </mesh>
          <mesh position={[i - 3.5, 0.047, -4.42]} rotation={[-Math.PI / 2, 0, Math.PI]} material={mats.labels[ch]}>
            <planeGeometry args={[0.4, 0.4]} />
          </mesh>
        </group>
      ))}
      {RANKS.split('').map((ch, i) => (
        <group key={'r' + ch}>
          <mesh position={[-4.42, 0.047, 3.5 - i]} rotation={[-Math.PI / 2, 0, 0]} material={mats.labels[ch]}>
            <planeGeometry args={[0.4, 0.4]} />
          </mesh>
          <mesh position={[4.42, 0.047, 3.5 - i]} rotation={[-Math.PI / 2, 0, Math.PI]} material={mats.labels[ch]}>
            <planeGeometry args={[0.4, 0.4]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */
const Piece = memo(function Piece({ piece, shownType, held, geos, mats, selected, onSquare, fallen, shadows, registry }) {
  const group = useRef()
  const inner = useRef()
  const blob = useRef()
  const anim = useRef(null)
  const initialised = useRef(false)
  const lift = useRef(0)
  const tilt = useRef(0)
  const pop = useRef(0)
  const prevType = useRef(shownType)

  const target = useMemo(
    () => (piece.captured ? trayPos(piece) : squarePos(piece.square)),
    [piece.captured, piece.square, piece.tray, piece.color], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const scaleGoal = piece.captured ? 0.62 : 1

  useLayoutEffect(() => {
    registry.current.set(piece.id, { group: group.current })
    return () => registry.current.delete(piece.id)
  }, [piece.id, registry])

  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    if (!initialised.current) {
      g.position.set(target[0], target[1], target[2])
      g.scale.setScalar(scaleGoal)
      initialised.current = true
      return
    }
    if (held) return
    const to = new THREE.Vector3(target[0], target[1], target[2])
    const from = g.position.clone()
    const dist = from.distanceTo(to)
    if (dist < 0.003 && Math.abs(g.scale.x - scaleGoal) < 0.003) {
      anim.current = null
      return
    }
    anim.current = {
      from,
      to,
      sFrom: g.scale.x,
      sTo: scaleGoal,
      t: piece.captured ? -0.12 : 0,
      dur: piece.captured ? 0.85 : 0.3 + Math.min(dist, 7) * 0.06,
      lift: piece.captured ? 1.5 : piece.type === 'n' ? 0.95 : 0.3,
    }
  }, [target, held, scaleGoal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevType.current !== shownType) {
      pop.current = 1
      prevType.current = shownType
    }
  }, [shownType])

  useFrame((state, dt) => {
    const g = group.current
    const n = inner.current
    if (!g || !n) return
    const a = anim.current
    if (a && !held) {
      a.t += dt
      if (a.t >= 0) {
        const k = Math.min(1, a.t / a.dur)
        const e = ease(k)
        g.position.x = a.from.x + (a.to.x - a.from.x) * e
        g.position.z = a.from.z + (a.to.z - a.from.z) * e
        g.position.y = a.from.y + (a.to.y - a.from.y) * e + a.lift * Math.sin(Math.PI * k)
        g.scale.setScalar(a.sFrom + (a.sTo - a.sFrom) * e)
        if (k >= 1) anim.current = null
      }
    }
    const goal = selected ? 0.16 + Math.sin(state.clock.elapsedTime * 4) * 0.025 : 0
    lift.current += (goal - lift.current) * Math.min(1, dt * 12)
    tilt.current += ((fallen ? 1.45 : 0) - tilt.current) * Math.min(1, dt * 2.4)
    if (pop.current > 0) pop.current = Math.max(0, pop.current - dt * 3)
    n.position.y = lift.current + 0.34 * Math.sin(Math.min(tilt.current, 1.5))
    n.rotation.z = tilt.current
    n.scale.setScalar(1 + 0.25 * Math.sin(pop.current * Math.PI))

    // contact shadow stays on the surface and softens as the piece rises
    if (blob.current) {
      const h = Math.max(0, g.position.y + n.position.y)
      blob.current.position.y = 0.006 - g.position.y
      blob.current.material.opacity = 0.62 / (1 + h * 1.2)
      blob.current.scale.setScalar(1 + h * 0.28)
    }
  })

  const rotY = shownType === 'n' ? (piece.color === 'w' ? Math.PI / 2 + 0.6 : -Math.PI / 2 + 0.6) : 0

  return (
    <group ref={group}>
      <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[1.2, 1.2]} />
        <meshBasicMaterial map={mats.blobTex} transparent opacity={0.6} depthWrite={false} toneMapped={false} color="#000000" />
      </mesh>
      <group ref={inner}>
        <mesh
          geometry={geos[shownType]}
          material={piece.color === 'w' ? mats.pieceW : mats.pieceB}
          rotation={[0, rotY, 0]}
          castShadow={shadows}
          receiveShadow={shadows}
          onClick={(e) => {
            if (piece.captured || !piece.square) return
            e.stopPropagation()
            onSquare(piece.square)
          }}
          onPointerOver={() => {
            if (!piece.captured) document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto'
          }}
        />
      </group>
    </group>
  )
})

function Pieces({ pieces, mats, selected, onSquare, fallenKing, shadows, registry, holdRef }) {
  const geos = useMemo(() => createPieceGeometries(), [])
  useEffect(() => () => disposeGeometries(geos), [geos])
  return (
    <group>
      {pieces.map((p) => {
        const h = holdRef.current.get(p.id)
        return (
          <Piece
            key={p.id}
            piece={p}
            shownType={h && h.type ? h.type : p.type}
            held={!!h}
            geos={geos}
            mats={mats}
            selected={!p.captured && p.square === selected}
            onSquare={onSquare}
            fallen={p.type === 'k' && p.color === fallenKing}
            shadows={shadows}
            registry={registry}
          />
        )
      })}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Highlights: glow under selection, pulsing hints                      */
/* ------------------------------------------------------------------ */
const FLAT = [-Math.PI / 2, 0, 0]

function SelectGlow({ sq, glowTex }) {
  const glow = useRef()
  const ring = useRef()
  const p = squarePos(sq)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    if (glow.current) {
      glow.current.scale.setScalar(1 + Math.sin(t * 3.2) * 0.08)
      glow.current.material.opacity = 0.8 + Math.sin(t * 3.2) * 0.15
    }
    if (ring.current) {
      const k = (t % 1.4) / 1.4
      ring.current.scale.setScalar(0.7 + k * 0.9)
      ring.current.material.opacity = 0.7 * (1 - k)
    }
  })
  return (
    <group position={[p[0], 0.012, p[2]]} rotation={FLAT}>
      <mesh ref={glow} raycast={noRaycast}>
        <planeGeometry args={[2.1, 2.1]} />
        <meshBasicMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0, 0.003]} raycast={noRaycast}>
        <ringGeometry args={[0.4, 0.44, 48]} />
        <meshBasicMaterial color="#ffd77a" transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Marker({ to, capture, index }) {
  const ref = useRef()
  const p = squarePos(to)
  useFrame((s) => {
    const k = 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 3.4 + index * 0.55)
    if (!ref.current) return
    ref.current.scale.setScalar(capture ? 0.94 + 0.12 * k : 0.8 + 0.4 * k)
    ref.current.material.opacity = capture ? 0.65 + 0.35 * k : 0.5 + 0.45 * k
  })
  return (
    <mesh ref={ref} position={[p[0], 0.018, p[2]]} rotation={FLAT} raycast={noRaycast}>
      {capture ? <ringGeometry args={[0.36, 0.47, 40]} /> : <circleGeometry args={[0.15, 32]} />}
      <meshBasicMaterial color={capture ? '#ff6a4d' : '#7dffb2'} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function Highlights({ selected, targets, lastMove, checkSquare, glowTex }) {
  const checkRef = useRef()
  useFrame((s) => {
    if (checkRef.current) checkRef.current.material.opacity = 0.35 + Math.sin(s.clock.elapsedTime * 6) * 0.15
  })
  return (
    <group>
      {lastMove &&
        [lastMove.from, lastMove.to].map((sq) => {
          const p = squarePos(sq)
          return (
            <mesh key={'lm' + sq} position={[p[0], 0.008, p[2]]} rotation={FLAT} raycast={noRaycast}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial color="#e8c15a" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
            </mesh>
          )
        })}
      {selected && <SelectGlow sq={selected} glowTex={glowTex} />}
      {checkSquare && (
        <mesh ref={checkRef} position={[squarePos(checkSquare)[0], 0.014, squarePos(checkSquare)[2]]} rotation={FLAT} raycast={noRaycast}>
          <circleGeometry args={[0.52, 40]} />
          <meshBasicMaterial color="#ff2d2d" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {targets.map((t, i) => (
        <Marker key={t.to} to={t.to} capture={t.capture} index={i} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */
function Burst({ fx, onDone }) {
  const ref = useRef()
  const t = useRef(0)
  const data = useMemo(() => {
    const n = 26
    const p = new Float32Array(n * 3)
    const v = new Float32Array(n * 3)
    const [x, , z] = squarePos(fx.sq)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.8 + Math.random() * 1.6
      p[i * 3] = x
      p[i * 3 + 1] = 0.3
      p[i * 3 + 2] = z
      v[i * 3] = Math.cos(a) * sp
      v[i * 3 + 1] = 1.6 + Math.random() * 2.2
      v[i * 3 + 2] = Math.sin(a) * sp
    }
    return { p, v, n }
  }, [fx])
  useFrame((_, dt) => {
    t.current += dt
    const { p, v, n } = data
    for (let i = 0; i < n; i++) {
      p[i * 3] += v[i * 3] * dt
      p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + v[i * 3 + 1] * dt)
      p[i * 3 + 2] += v[i * 3 + 2] * dt
      v[i * 3 + 1] -= 7 * dt
    }
    const pts = ref.current
    if (pts) {
      pts.geometry.attributes.position.needsUpdate = true
      pts.material.opacity = Math.max(0, 1 - t.current / 0.8)
    }
    if (t.current > 0.8) onDone(fx.id)
  })
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.p, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} color={fx.color === 'w' ? '#fff3d6' : '#d6a15a'} transparent depthWrite={false} sizeAttenuation />
    </points>
  )
}

// golden confetti shower for the checkmate moment
function Confetti({ id }) {
  const ref = useRef()
  const t = useRef(0)
  const data = useMemo(() => {
    const n = 140
    const p = new Float32Array(n * 3)
    const v = new Float32Array(n * 3)
    const c = new Float32Array(n * 3)
    const col = [new THREE.Color('#ffd77a'), new THREE.Color('#fff3d6'), new THREE.Color('#e8a94a'), new THREE.Color('#ffffff')]
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 9
      p[i * 3 + 1] = 7 + Math.random() * 5
      p[i * 3 + 2] = (Math.random() - 0.5) * 9
      v[i * 3] = (Math.random() - 0.5) * 0.8
      v[i * 3 + 1] = -(1.2 + Math.random() * 1.6)
      v[i * 3 + 2] = (Math.random() - 0.5) * 0.8
      const cc = col[Math.floor(Math.random() * col.length)]
      c[i * 3] = cc.r
      c[i * 3 + 1] = cc.g
      c[i * 3 + 2] = cc.b
    }
    return { p, v, c, n }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((s, dt) => {
    t.current += dt
    const { p, v, n } = data
    for (let i = 0; i < n; i++) {
      p[i * 3] += (v[i * 3] + Math.sin(s.clock.elapsedTime * 2 + i) * 0.3) * dt
      p[i * 3 + 1] = Math.max(0.03, p[i * 3 + 1] + v[i * 3 + 1] * dt)
      p[i * 3 + 2] += v[i * 3 + 2] * dt
    }
    if (ref.current) {
      ref.current.geometry.attributes.position.needsUpdate = true
      ref.current.material.opacity = Math.min(1, Math.max(0, 5 - t.current) / 1.5)
    }
  })
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.p, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.c, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.16} vertexColors transparent depthWrite={false} sizeAttenuation />
    </points>
  )
}

function MateSpot({ sq }) {
  const ref = useRef()
  const { scene } = useThree()
  const p = squarePos(sq)
  useEffect(() => {
    const l = ref.current
    if (!l) return
    l.target.position.set(p[0], 0, p[2])
    scene.add(l.target)
    return () => scene.remove(l.target)
  }, [sq]) // eslint-disable-line react-hooks/exhaustive-deps
  return <spotLight ref={ref} position={[p[0], 7.5, p[2] + 0.5]} angle={0.38} penumbra={1} intensity={900} distance={30} decay={2} color="#ffe2a8" />
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */
const BASE_FOV = 40

function CameraRig({ side, controlsRef, interactive, checkPulse, mate, homeSignal }) {
  const { camera, size } = useThree()
  const flipping = useRef(false)
  const lastClass = useRef(null)
  const lastSide = useRef(side)
  const fov = useRef({ t: 1 })
  const cine = useRef(null)

  useLayoutEffect(() => {
    const aspect = size.width / size.height
    const cls = aspect < 1.1 ? 'portrait' : 'landscape'
    if (lastClass.current === cls) return
    lastClass.current = cls
    const f = (camera.fov * Math.PI) / 180
    let d = 19
    if (aspect < 1.1) d = Math.max(19, 5.4 / (Math.tan(f / 2) * aspect))
    const polar = aspect < 1.1 ? 0.7 : 0.95
    const az = side === 'w' ? 0 : Math.PI
    camera.position.set(d * Math.sin(polar) * Math.sin(az), d * Math.cos(polar), d * Math.sin(polar) * Math.cos(az))
    camera.lookAt(0, 0, 0)
    controlsRef.current?.update()
  }, [size.width, size.height]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lastSide.current !== side) {
      lastSide.current = side
      flipping.current = true
    }
  }, [side])

  // subtle FOV punch when a king is put in check
  useEffect(() => {
    if (checkPulse > 0) fov.current.t = 0
  }, [checkPulse])

  // checkmate: glide in on the fallen king
  useEffect(() => {
    const ctr = controlsRef.current
    if (!mate || !ctr) return
    const [kx, , kz] = squarePos(mate.kingSq)
    const startT = ctr.target.clone()
    const startO = camera.position.clone().sub(ctr.target)
    const endT = new THREE.Vector3(kx, 0.4, kz)
    const len = 8.5
    const endO = startO.clone().setY(0).normalize().multiplyScalar(len * 0.82).setY(len * 0.55)
    endO.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7)
    cine.current = { t: 0, startT, startO, endT, endO, dur: 2.8, kind: 'mate' }
  }, [mate]) // eslint-disable-line react-hooks/exhaustive-deps

  // new game after a cinematic: glide back to the board centre
  useEffect(() => {
    const ctr = controlsRef.current
    if (!ctr || ctr.target.lengthSq() < 0.01) return
    const startT = ctr.target.clone()
    const startO = camera.position.clone().sub(ctr.target)
    const az = side === 'w' ? 0 : Math.PI
    const d = 19
    const polar = 0.95
    const endO = new THREE.Vector3(d * Math.sin(polar) * Math.sin(az), d * Math.cos(polar), d * Math.sin(polar) * Math.cos(az))
    cine.current = { t: 0, startT, startO, endT: new THREE.Vector3(0, 0, 0), endO, dur: 1.1, kind: 'home' }
  }, [homeSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const ctr = controlsRef.current
    // FOV punch
    const f = fov.current
    if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / 0.9)
      camera.fov = BASE_FOV - 6 * Math.sin(Math.PI * f.t) * (1 - f.t * 0.35)
      camera.updateProjectionMatrix()
      if (f.t >= 1) {
        camera.fov = BASE_FOV
        camera.updateProjectionMatrix()
      }
    }
    if (!ctr) return

    const c = cine.current
    if (c) {
      c.t = Math.min(1, c.t + dt / c.dur)
      const k = ease(c.t)
      ctr.target.lerpVectors(c.startT, c.endT, k)
      const off = new THREE.Vector3().lerpVectors(c.startO, c.endO, k)
      camera.position.copy(ctr.target).add(off)
      ctr.update()
      if (c.t >= 1) cine.current = null
      return
    }

    if (!flipping.current) return
    const goal = side === 'w' ? 0 : Math.PI
    let delta = goal - ctr.getAzimuthalAngle()
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    if (Math.abs(delta) < 0.01) {
      flipping.current = false
      return
    }
    const step = delta * Math.min(1, dt * 3.2)
    const p = camera.position
    const x = p.x * Math.cos(step) + p.z * Math.sin(step)
    const z = -p.x * Math.sin(step) + p.z * Math.cos(step)
    p.x = x
    p.z = z
    ctr.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={34}
      minPolarAngle={0.2}
      maxPolarAngle={1.34}
      autoRotate={!interactive}
      autoRotateSpeed={0.5}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Lights                                                              */
/* ------------------------------------------------------------------ */
function Lights({ tier }) {
  return (
    <>
      <hemisphereLight args={['#fff1dd', '#2a1a10', tier.env ? 0.28 : 0.8]} />
      <directionalLight
        position={[7, 14, 8]}
        intensity={tier.env ? 2.1 : 2.6}
        color="#fff0da"
        castShadow={tier.shadows > 0}
        shadow-mapSize={[tier.shadows || 512, tier.shadows || 512]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */
export default function Scene({
  tier,
  materials,
  pieces,
  selected,
  targets,
  lastMove,
  checkSquare,
  events,
  resetToken,
  handsOn,
  showHands,
  onBusy,
  onPlace,
  onMateShown,
  onSquare,
  viewSide,
  interactive,
  onDecline,
  autoQuality,
}) {
  const controlsRef = useRef()
  const registry = useRef(new Map())
  const holdRef = useRef(new Map())
  const [, setHoldV] = useState(0)
  const [busy, setBusy] = useState(false)
  const [bursts, setBursts] = useState([])
  const [checkPulse, setCheckPulse] = useState(0)
  const [mate, setMate] = useState(null)
  const [homeSignal, setHomeSignal] = useState(0)
  const [sideShown, setSideShown] = useState(viewSide)

  const handsActive = !!(handsOn && tier.hands)

  // Mark pieces "in the hand" during render, before children read it, so they never self-animate.
  const seen = useRef(events.length)
  if (handsActive && events.length > seen.current) {
    for (let i = seen.current; i < events.length; i++) {
      const ev = events[i]
      ev.steps.forEach((s) => holdRef.current.set(s.pieceId, { type: s.type }))
      if (ev.captureId) holdRef.current.set(ev.captureId, { type: null })
    }
  }
  seen.current = events.length

  const release = useCallback((id) => {
    if (holdRef.current.delete(id)) setHoldV((v) => v + 1)
  }, [])

  useEffect(() => {
    if (!handsActive && holdRef.current.size) {
      holdRef.current.clear()
      setHoldV((v) => v + 1)
    }
  }, [handsActive])

  // new game / undo / sync
  const firstReset = useRef(true)
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false
      return
    }
    holdRef.current.clear()
    setHoldV((v) => v + 1)
    setBursts([])
    setMate(null)
    setHomeSignal((v) => v + 1)
  }, [resetToken])

  const handleBusy = useCallback(
    (v) => {
      setBusy(v)
      onBusy?.(v)
    },
    [onBusy],
  )

  const handlePlace = useCallback(
    (ev) => {
      onPlace?.(ev)
      if (ev.captureSq && tier.particles) {
        setBursts((b) => [...b, { id: Math.random().toString(36).slice(2), sq: ev.captureSq, color: ev.side === 'w' ? 'b' : 'w' }])
      }
      if (ev.check && !ev.mate) setCheckPulse((n) => n + 1)
    },
    [onPlace, tier.particles],
  )

  const handleMate = useCallback(
    (ev) => {
      setMate({ id: ev.id, kingSq: ev.mateKingSq, loser: ev.side === 'w' ? 'b' : 'w' })
      onMateShown?.(ev)
    },
    [onMateShown],
  )

  const removeBurst = useCallback((id) => setBursts((b) => b.filter((x) => x.id !== id)), [])

  // camera only turns to the other player once the hand has finished
  useEffect(() => {
    if (!busy) setSideShown(viewSide)
  }, [busy, viewSide])

  return (
    <Canvas
      shadows={tier.shadows > 0 ? 'soft' : false}
      dpr={tier.dpr}
      camera={{ position: [0, 10, 10], fov: BASE_FOV, near: 0.1, far: 120 }}
      gl={{ antialias: tier.antialias, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#0f0b08']} />
      <fog attach="fog" args={['#0f0b08', 34, 85]} />

      {autoQuality && <PerformanceMonitor onDecline={onDecline} flipflops={2} />}

      <Lights tier={tier} />
      {tier.env > 0 && (
        <Environment resolution={tier.env} frames={1}>
          <Lightformer form="rect" intensity={2.0} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
          <Lightformer form="rect" intensity={1.4} position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[9, 4, 1]} color="#ffd9a8" />
          <Lightformer form="rect" intensity={1.0} position={[8, 3, -3]} rotation-y={-Math.PI / 2} scale={[9, 4, 1]} color="#bcd0ff" />
        </Environment>
      )}

      <Room mats={materials} tier={tier} />
      <Table mats={materials} shadows={tier.shadows > 0} />
      <Trays mats={materials} shadows={tier.shadows > 0} />
      <Board mats={materials} onSquare={onSquare} shadows={tier.shadows > 0} />
      <Pieces
        pieces={pieces}
        mats={materials}
        selected={selected}
        onSquare={onSquare}
        fallenKing={mate ? mate.loser : null}
        shadows={tier.shadows > 0}
        registry={registry}
        holdRef={holdRef}
      />
      <Highlights
        selected={busy ? null : selected}
        targets={busy ? [] : targets}
        lastMove={lastMove}
        checkSquare={busy ? null : checkSquare}
        glowTex={materials.glowTex}
      />
      <Hands
        active={showHands}
        enabled={handsActive}
        events={events}
        resetToken={resetToken}
        registry={registry}
        release={release}
        onPlace={handlePlace}
        onBusy={handleBusy}
        onMate={handleMate}
      />
      {tier.particles && bursts.map((f) => <Burst key={f.id} fx={f} onDone={removeBurst} />)}
      {mate && tier.particles && <Confetti id={mate.id} />}
      {mate && tier.shadows > 0 && <MateSpot sq={mate.kingSq} />}

      <CameraRig side={sideShown} controlsRef={controlsRef} interactive={interactive} checkPulse={checkPulse} mate={mate} homeSignal={homeSignal} />
    </Canvas>
  )
}
