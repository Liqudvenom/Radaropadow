/**
 * CloudParticles
 *
 * Animated point cloud orbiting the globe to simulate moving cloud cover.
 * Points are clustered around storm locations for density effect.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { latLonToVec3 } from '../utils/geoUtils'

const GLOBAL_PARTICLES = 800
const STORM_PARTICLES_PER = 40

export default function CloudParticles({ storms = [], visible = true }) {
  const meshRef = useRef()
  const speedRef = useRef(new Float32Array(GLOBAL_PARTICLES + storms.length * STORM_PARTICLES_PER))

  const { positions, speeds } = useMemo(() => {
    const total = GLOBAL_PARTICLES + storms.length * STORM_PARTICLES_PER
    const pos = new Float32Array(total * 3)
    const spd = new Float32Array(total)

    // Background cloud particles (random distribution)
    for (let i = 0; i < GLOBAL_PARTICLES; i++) {
      const lat = (Math.random() - 0.5) * 160
      const lon = (Math.random() - 0.5) * 360
      const r = 1.02 + Math.random() * 0.01
      const [x, y, z] = latLonToVec3(lat, lon, r)
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
      spd[i] = (Math.random() - 0.5) * 0.001
    }

    // Dense cloud clusters around storms
    storms.forEach((storm, si) => {
      for (let j = 0; j < STORM_PARTICLES_PER; j++) {
        const idx = GLOBAL_PARTICLES + si * STORM_PARTICLES_PER + j
        const spread = 8
        const lat = storm.coordinates.lat + (Math.random() - 0.5) * spread
        const lon = storm.coordinates.lon + (Math.random() - 0.5) * spread
        const r = 1.02 + Math.random() * 0.015
        const [x, y, z] = latLonToVec3(lat, lon, r)
        pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z
        spd[idx] = (Math.random() - 0.5) * 0.003 * (1 + storm.intensity)
      }
    })

    return { positions: pos, speeds: spd }
  }, [storms.length])

  useFrame(() => {
    if (!meshRef.current) return
    const attr = meshRef.current.geometry.attributes.position
    for (let i = 0; i < attr.count; i++) {
      // Orbit around Y axis
      const x = attr.getX(i)
      const z = attr.getZ(i)
      const angle = speeds[i]
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      attr.setX(i, x * cos - z * sin)
      attr.setZ(i, x * sin + z * cos)
    }
    attr.needsUpdate = true
  })

  if (!visible) return null

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#e0f2fe"
        size={0.004}
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
