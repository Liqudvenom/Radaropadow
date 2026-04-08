/**
 * WindLayer
 *
 * Renders wind vectors as instanced arrow meshes on the globe surface.
 * Arrow size scales with wind speed; color indicates strength:
 *   calm → dark blue   strong → cyan   severe → red
 *
 * Uses InstancedMesh for GPU-efficient rendering of 40+ arrows.
 */
import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { latLonToVec3, bearingToTangent } from '../utils/geoUtils'

const MAX_INSTANCES = 512

function windColor(speedKmh) {
  const t = Math.min(1, speedKmh / 150)
  if (t < 0.33) return new THREE.Color().setHSL(0.6, 0.8, 0.5)         // blue
  if (t < 0.66) return new THREE.Color().setHSL(0.5, 1.0, 0.6)         // cyan
  return new THREE.Color().setHSL(0.0, 1.0, 0.5)                        // red
}

export default function WindLayer({ windPoints = [], visible = true }) {
  const meshRef = useRef()

  const arrowGeometry = useMemo(() => {
    // A simple arrow shape: cone pointing in +Z direction
    const shape = new THREE.Shape()
    shape.moveTo(0, 0.5)     // tip
    shape.lineTo(-0.2, -0.5)
    shape.lineTo(-0.05, -0.3)
    shape.lineTo(-0.05, -0.8)
    shape.lineTo(0.05, -0.8)
    shape.lineTo(0.05, -0.3)
    shape.lineTo(0.2, -0.5)
    shape.closePath()

    const g = new THREE.ShapeGeometry(shape)
    return g
  }, [])

  const count = Math.min(windPoints.length, MAX_INSTANCES)

  useEffect(() => {
    if (!meshRef.current || windPoints.length === 0) return

    const dummy = new THREE.Object3D()
    const colors = new Float32Array(MAX_INSTANCES * 3)

    for (let i = 0; i < count; i++) {
      const wp = windPoints[i]
      const [x, y, z] = latLonToVec3(wp.lat, wp.lon, 1.015)

      // Orient arrow toward wind direction on sphere surface
      const position = new THREE.Vector3(x, y, z)
      const outward = position.clone().normalize()

      const tangent = bearingToTangent(wp.lat, wp.lon, wp.direction_deg)
      const tangentVec = new THREE.Vector3(...tangent)

      const right = new THREE.Vector3().crossVectors(outward, tangentVec).normalize()
      const up = new THREE.Vector3().crossVectors(right, outward).normalize()

      const rotMatrix = new THREE.Matrix4().makeBasis(right, up, outward)
      dummy.position.set(x, y, z)
      dummy.setRotationFromMatrix(rotMatrix)

      const scale = Math.max(0.003, Math.min(0.012, wp.speed_kmh / 15000))
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)

      // Color
      const c = windColor(wp.speed_kmh)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }

    meshRef.current.instanceMatrix.needsUpdate = true

    if (!meshRef.current.geometry.attributes.color) {
      meshRef.current.geometry.setAttribute(
        'color',
        new THREE.InstancedBufferAttribute(colors, 3)
      )
    } else {
      meshRef.current.geometry.attributes.color.array.set(colors)
      meshRef.current.geometry.attributes.color.needsUpdate = true
    }
  }, [windPoints, count])

  if (!visible || windPoints.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[arrowGeometry, null, MAX_INSTANCES]}>
      <meshBasicMaterial vertexColors transparent opacity={0.75} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}
