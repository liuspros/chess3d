import { useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

export const TRAY_X = 6.5
export const TRAY_Y = 0.0

// slot position (world) for the nth captured piece of a colour
export function trayPos(piece) {
  const idx = piece.tray || 0
  const col = idx % 2
  const row = Math.floor(idx / 2)
  const side = piece.color === 'w' ? -1 : 1
  return [side * TRAY_X + (col === 0 ? -0.55 : 0.55), TRAY_Y, -3.15 + row * 0.9]
}

const FLOOR_Y = -12

/* ------------------------------------------------------------------ */
/* Table + trays                                                        */
/* ------------------------------------------------------------------ */
export function Table({ mats, shadows }) {
  const legs = [
    [-8.2, -5.8],
    [8.2, -5.8],
    [-8.2, 5.8],
    [8.2, 5.8],
  ]
  return (
    <group>
      <RoundedBox args={[18.6, 0.4, 13.4]} radius={0.08} smoothness={3} position={[0, -0.51, 0]} material={mats.table} receiveShadow castShadow={shadows} />
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, (FLOOR_Y - 0.71) / 2, z]} material={mats.frame} castShadow={shadows}>
          <boxGeometry args={[0.8, -FLOOR_Y - 0.71, 0.8]} />
        </mesh>
      ))}
      {/* apron under the top */}
      <mesh position={[0, -1.1, 0]} material={mats.frame}>
        <boxGeometry args={[17.2, 0.8, 12.0]} />
      </mesh>
    </group>
  )
}

export function Trays({ mats, shadows }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * TRAY_X, 0, 0]}>
          <RoundedBox args={[2.5, 0.3, 8.0]} radius={0.05} smoothness={2} position={[0, -0.16, 0]} material={mats.frame} castShadow={shadows} receiveShadow />
          <mesh position={[0, -0.005, 0]} material={mats.felt} receiveShadow>
            <boxGeometry args={[2.2, 0.02, 7.6]} />
          </mesh>
          {[-1.175, 1.175].map((x) => (
            <mesh key={'l' + x} position={[x, 0.04, 0]} material={mats.frame} castShadow={shadows}>
              <boxGeometry args={[0.15, 0.1, 8.0]} />
            </mesh>
          ))}
          {[-3.925, 3.925].map((z) => (
            <mesh key={'s' + z} position={[0, 0.04, z]} material={mats.frame} castShadow={shadows}>
              <boxGeometry args={[2.5, 0.1, 0.15]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */
function Bookshelf({ position, rotation }) {
  const { matrices, colors } = useMemo(() => {
    const m = []
    const c = []
    const palette = ['#5b2a22', '#274a3b', '#2f3f63', '#6b4a22', '#3d2a45', '#7a5b3a', '#1f2a2a', '#8a3a2a']
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const dummy = new THREE.Object3D()
    for (let shelf = 0; shelf < 5; shelf++) {
      let z = -6.4
      const y0 = -8.9 + shelf * 4.3
      while (z < 6.2) {
        const w = 0.35 + rnd() * 0.45
        const h = 2.4 + rnd() * 1.4
        dummy.position.set(0, y0 + h / 2, z + w / 2)
        dummy.scale.set(1.5, h, w)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        m.push(dummy.matrix.clone())
        c.push(new THREE.Color(palette[Math.floor(rnd() * palette.length)]))
        z += w + 0.04
      }
    }
    return { matrices: m, colors: c }
  }, [])
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0.5, 1.5, 0]}>
        <boxGeometry args={[0.5, 25, 14.4]} />
        <meshStandardMaterial color="#1b120c" roughness={0.8} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, -9 + i * 4.3, 0]}>
          <boxGeometry args={[1.9, 0.25, 14.4]} />
          <meshStandardMaterial color="#2a1a10" roughness={0.6} />
        </mesh>
      ))}
      <instancedMesh
        args={[null, null, matrices.length]}
        ref={(im) => {
          if (!im) return
          matrices.forEach((mat, i) => {
            im.setMatrixAt(i, mat)
            im.setColorAt(i, colors[i])
          })
          im.instanceMatrix.needsUpdate = true
          if (im.instanceColor) im.instanceColor.needsUpdate = true
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  )
}

function PictureFrame({ position, size, color }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[size[0] + 0.5, size[1] + 0.5, 0.2]} />
        <meshStandardMaterial color="#b8923f" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.11]}>
        <planeGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Lamp({ mats, high }) {
  return (
    <group position={[0, 11.5, 0]}>
      <mesh position={[0, 4.4, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 8.8, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <coneGeometry args={[2.4, 1.7, 40, 1, true]} />
        <meshStandardMaterial color="#1d3a2c" metalness={0.45} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <sphereGeometry args={[0.42, 20, 16]} />
        <meshBasicMaterial color="#ffe8b8" toneMapped={false} />
      </mesh>
      <pointLight position={[0, -0.6, 0]} intensity={high ? 520 : 380} distance={60} decay={2} color="#ffd9a0" />
    </group>
  )
}

export function Room({ mats, tier }) {
  const full = tier.room === 'full'
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} material={mats.floor} receiveShadow>
        <planeGeometry args={[70, 60]} />
      </mesh>
      {full && mats.rug && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.02, 0]} material={mats.rug}>
          <planeGeometry args={[26, 34]} />
        </mesh>
      )}

      {/* walls + ceiling */}
      <mesh position={[0, 4, -24]} material={mats.plaster}>
        <planeGeometry args={[70, 32]} />
      </mesh>
      <mesh position={[0, 4, 30]} rotation={[0, Math.PI, 0]} material={mats.plaster}>
        <planeGeometry args={[70, 32]} />
      </mesh>
      <mesh position={[-30, 4, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.plaster}>
        <planeGeometry args={[60, 32]} />
      </mesh>
      <mesh position={[30, 4, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.plaster}>
        <planeGeometry args={[60, 32]} />
      </mesh>
      <mesh position={[0, 20, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[70, 60]} />
        <meshStandardMaterial color="#1c1612" roughness={1} />
      </mesh>

      {full && (
        <>
          {/* wainscot + chair rail on the back wall */}
          <mesh position={[0, -7.5, -23.85]}>
            <boxGeometry args={[70, 9, 0.3]} />
            <meshStandardMaterial color="#2a1a10" roughness={0.55} />
          </mesh>
          <mesh position={[0, -2.9, -23.7]}>
            <boxGeometry args={[70, 0.35, 0.5]} />
            <meshStandardMaterial color="#b8923f" metalness={0.7} roughness={0.4} />
          </mesh>
          <PictureFrame position={[-9, 6, -23.8]} size={[5, 6.5]} color="#1f4a4a" />
          <PictureFrame position={[1, 7.5, -23.8]} size={[8, 5]} color="#5a2a2e" />
          <PictureFrame position={[11, 6, -23.8]} size={[4.5, 6]} color="#8a6a2e" />

          {/* window on the left wall */}
          <group position={[-29.8, 4, -6]} rotation={[0, Math.PI / 2, 0]}>
            <mesh>
              <planeGeometry args={[9, 14]} />
              <meshBasicMaterial color="#6f8fc8" toneMapped={false} />
            </mesh>
            {[[0, 7.2, 9.6, 0.5], [0, -7.2, 9.6, 0.5], [-4.8, 0, 0.5, 14.6], [4.8, 0, 0.5, 14.6], [0, 0, 0.3, 14], [0, 0, 9, 0.3]].map(([x, y, w, h], i) => (
              <mesh key={i} position={[x, y, 0.1]}>
                <boxGeometry args={[w, h, 0.35]} />
                <meshStandardMaterial color="#c8b79a" roughness={0.6} />
              </mesh>
            ))}
          </group>
          <pointLight position={[-24, 4, -6]} intensity={160} distance={50} decay={2} color="#7a98d8" />

          <Bookshelf position={[28.4, 4, -3]} rotation={[0, 0, 0]} />
        </>
      )}

      {full && <Lamp mats={mats} high={tier.name === 'high'} />}
    </group>
  )
}
