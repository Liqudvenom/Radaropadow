/**
 * GlobeView — encapsulates the 3D scene previously inlined in App.jsx.
 *
 * Owns:
 *   - Scene composition (lights, Earth layers, storm/wind/cloud overlays)
 *   - Camera fly-to animation (cameraFly utility, store-locked)
 *   - OrbitControls with min/max distance from navigationUtils
 *   - Snapshot interpolation for smooth timeline scrubbing
 *
 * Does NOT own:
 *   - The <Canvas> itself (App.jsx still mounts it so we can swap to Map2D)
 *   - The view-mode toggle UI
 */
import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

import Globe from './Globe/Globe'
import StormMarkers from './StormMarkers'
import WindLayer from './WindLayer'
import CloudParticles from './CloudParticles'
import StarField from './StarField'
import AirQualityLayer from './AirQualityLayer'

import useStormStore from '../store'
import { snapshotAtFractional } from '../utils/snapshotInterp'
import { makeCameraFly } from '../utils/cameraFly'
import {
  CAMERA,
  cameraTargetForLatLon,
  focusDistanceForStorm,
} from '../utils/navigationUtils'

/**
 * Drives the cameraFly state machine + writes cameraLocked to the store
 * so other parts of the UI (view-mode toggle, OrbitControls) can react.
 */
function CameraFocus({ controlsRef }) {
  const { camera } = useThree()
  const selectedStorm = useStormStore((s) => s.selectedStorm)
  const setCameraLocked = useStormStore((s) => s.setCameraLocked)

  const flyRef = useRef(null)
  if (flyRef.current === null) flyRef.current = makeCameraFly()

  useEffect(() => {
    if (!selectedStorm) return
    const dist = focusDistanceForStorm(selectedStorm)
    const target = cameraTargetForLatLon(
      selectedStorm.coordinates.lat,
      selectedStorm.coordinates.lon,
      dist,
    )
    flyRef.current.start({
      camera,
      controls: controlsRef.current,
      target,
      duration: 1.4,
      onLock: () => setCameraLocked(true),
      onRelease: () => setCameraLocked(false),
    })
  }, [selectedStorm, camera, controlsRef, setCameraLocked])

  useFrame((_, delta) => {
    flyRef.current.tick(delta)
  })

  return null
}

export default function GlobeView() {
  const currentSnapshot = useStormStore((s) => s.currentSnapshot)
  const history = useStormStore((s) => s.history)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const layers = useStormStore((s) => s.layers)
  const cameraLocked = useStormStore((s) => s.cameraLocked)

  const controlsRef = useRef()

  // When scrubbing the timeline, interpolate between adjacent snapshots
  // so storm motion appears smooth rather than stepping.
  const activeSnapshot = useMemo(() => {
    if (playbackIndex === null) return currentSnapshot
    if (history.length === 0) return null
    return snapshotAtFractional(history, Math.min(playbackIndex, history.length - 1))
  }, [playbackIndex, history, currentSnapshot])

  const storms = activeSnapshot?.storms ?? []
  const windPoints = activeSnapshot?.wind_points ?? []
  const isLive = playbackIndex === null

  return (
    <>
      <StarField />

      <ambientLight intensity={0.07} />
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.0}
        castShadow={false}
        color="#d0e8ff"
      />
      <pointLight position={[-10, -5, -10]} intensity={0.3} color="#1e3a5f" />

      <Globe
        storms={layers.heatmap ? storms : []}
        showHeatmap={layers.heatmap}
        showRainRadar={layers.rainradar}
        autoRotate={isLive && !cameraLocked}
      />

      {layers.wind && <WindLayer windPoints={windPoints} visible />}
      {layers.storms && <StormMarkers storms={storms} />}
      {layers.airquality && <AirQualityLayer visible={layers.airquality} />}
      <CloudParticles storms={storms} visible />

      <CameraFocus controlsRef={controlsRef} />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={CAMERA.MIN_DISTANCE}
        maxDistance={CAMERA.MAX_DISTANCE}
        rotateSpeed={0.5}
        zoomSpeed={0.6}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  )
}
