/**
 * StormMarkers
 * Renders one animated marker per storm on the globe surface.
 *
 * - Pulsing ring(s) for active/severe storms (SEVERE gets a second, larger ring)
 * - Hover tooltip via <Html> from @react-three/drei
 * - Lightning bolt geometry for thunderstorm animation
 * - Color-coded by status
 * - Clickable to select a storm in the store
 */
import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { latLonToVec3, STATUS_COLORS } from '../utils/geoUtils'
import useStormStore from '../store'

const STATUS_HEX = {
  FORMING:     0xfacc15,
  ACTIVE:      0xf97316,
  SEVERE:      0xef4444,
  DISSIPATING: 0x64748b,
}

const STATUS_BADGE_CFG = {
  FORMING:     { label: 'FORMING',     cls: 'badge--forming' },
  ACTIVE:      { label: 'ACTIVE',      cls: 'badge--active' },
  SEVERE:      { label: 'SEVERE',      cls: 'badge--severe' },
  DISSIPATING: { label: 'DISSIPATING', cls: 'badge--dissipating' },
}

/**
 * @param {number} phaseOffset - phase offset in radians to stagger the animation
 * @param {number} innerR - inner ring radius
 * @param {number} outerR - outer ring radius
 */
function PulsingRing({ color, speed = 1.0, phaseOffset = 0, innerR = 0.012, outerR = 0.02 }) {
  const meshRef = useRef()
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime() * speed + phaseOffset
    const scale = 1 + 0.4 * Math.sin(t * Math.PI * 2)
    meshRef.current.scale.setScalar(scale)
    meshRef.current.material.opacity = 0.6 - 0.4 * Math.sin(t * Math.PI * 2)
  })
  return (
    <mesh ref={meshRef}>
      <ringGeometry args={[innerR, outerR, 32]} />
      <meshBasicMaterial color={color} transparent side={THREE.DoubleSide} opacity={0.6} />
    </mesh>
  )
}

function LightningFlash({ color }) {
  const meshRef = useRef()
  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    // Flash every ~2 seconds
    meshRef.current.material.opacity = Math.pow(Math.abs(Math.sin(t * 3)), 8) * 0.9
  })
  return (
    <mesh ref={meshRef} rotation={[0, 0, Math.PI / 8]}>
      <planeGeometry args={[0.012, 0.03]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  )
}

function PathLine({ path, color }) {
  const points = useMemo(
    () => path.map(({ lat, lon }) => new THREE.Vector3(...latLonToVec3(lat, lon, 1.008))),
    [path]
  )
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points)
    return g
  }, [points])

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.5} linewidth={1} />
    </line>
  )
}

function StormTooltip({ storm }) {
  const cfg = STATUS_BADGE_CFG[storm.status] ?? { label: storm.status, cls: '' }
  return (
    <div className="storm-tooltip">
      <span className="storm-tooltip-region">{storm.region}</span>
      <span className={`badge ${cfg.cls} storm-tooltip-badge`}>{cfg.label}</span>
      <span className="storm-tooltip-wind">💨 {storm.wind_speed_kmh} km/h</span>
    </div>
  )
}

function HighlightBeam({ color }) {
  // Outer ring + radial beam shown when this marker is highlighted from the
  // side panel. Visual cue that "this row over there is this dot here".
  const ringRef = useRef()
  useFrame(({ clock }) => {
    if (!ringRef.current) return
    const t = clock.getElapsedTime()
    const s = 1 + 0.6 * Math.abs(Math.sin(t * 3))
    ringRef.current.scale.setScalar(s)
    ringRef.current.material.opacity = 0.55 - 0.4 * Math.abs(Math.sin(t * 3))
  })
  return (
    <mesh ref={ringRef}>
      <ringGeometry args={[0.022, 0.034, 48]} />
      <meshBasicMaterial color={color} transparent side={THREE.DoubleSide} opacity={0.5} />
    </mesh>
  )
}

function StormMarker({ storm, onSelect, isHighlighted, isSelected, onHoverChange }) {
  const [hovered, setHovered] = useState(false)

  const [x, y, z] = latLonToVec3(storm.coordinates.lat, storm.coordinates.lon, 1.01)
  const color = STATUS_HEX[storm.status] ?? 0xffffff
  const colorHex = STATUS_COLORS[storm.status] ?? '#ffffff'
  const isActive = storm.status === 'ACTIVE' || storm.status === 'SEVERE'
  const isSevere = storm.status === 'SEVERE'

  // Orient marker to face outward from sphere surface
  const position = new THREE.Vector3(x, y, z)
  const normal = position.clone().normalize()
  const quaternion = new THREE.Quaternion()
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)

  return (
    <group position={[x, y, z]} quaternion={quaternion}>
      {/* Core dot */}
      <mesh
        onClick={() => onSelect(storm)}
        onPointerEnter={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerLeave={(e) => {
          e.stopPropagation()
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Primary pulsing ring */}
      {isActive && (
        <PulsingRing
          color={color}
          speed={isSevere ? 2.0 : 1.2}
          phaseOffset={0}
          innerR={0.012}
          outerR={0.02}
        />
      )}

      {/* Second, larger ring for SEVERE (phase-offset by π ≈ 0.5s delay) */}
      {isSevere && (
        <PulsingRing
          color={color}
          speed={2.0}
          phaseOffset={Math.PI}
          innerR={0.018}
          outerR={0.028}
        />
      )}

      {/* Lightning flash for severe */}
      {isSevere && <LightningFlash color={0xffd700} />}

      {/* Highlight beam when row is hovered in side panel OR storm is selected */}
      {(isHighlighted || isSelected) && <HighlightBeam color={color} />}

      {/* Predicted path */}
      {storm.predicted_path && storm.predicted_path.length > 0 && (
        <PathLine path={storm.predicted_path} color={colorHex} />
      )}

      {/* Hover tooltip — shown on either pointer hover or panel highlight */}
      {(hovered || isHighlighted) && (
        <Html
          distanceFactor={8}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[100, 0]}
        >
          <StormTooltip storm={storm} />
        </Html>
      )}
    </group>
  )
}

export default function StormMarkers({ storms = [] }) {
  const setSelectedStorm = useStormStore((s) => s.setSelectedStorm)
  const highlightedStormId = useStormStore((s) => s.highlightedStormId)
  const setHighlightedStormId = useStormStore((s) => s.setHighlightedStormId)
  const selectedStorm = useStormStore((s) => s.selectedStorm)

  return (
    <group>
      {storms.map((storm) => (
        <StormMarker
          key={storm.id}
          storm={storm}
          onSelect={setSelectedStorm}
          isHighlighted={highlightedStormId === storm.id}
          isSelected={selectedStorm?.id === storm.id}
          onHoverChange={(h) => setHighlightedStormId(h ? storm.id : null)}
        />
      ))}
    </group>
  )
}
