import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

import Globe from './components/Globe/Globe'
import StormMarkers from './components/StormMarkers'
import WindLayer from './components/WindLayer'
import CloudParticles from './components/CloudParticles'
import StarField from './components/StarField'
import AirQualityLayer from './components/AirQualityLayer'
import SidePanel from './components/SidePanel'
import Timeline from './components/Timeline'
import Map2D from './components/Map2D'

import { useWebSocket } from './hooks/useWebSocket'
import { useStormData } from './hooks/useStormData'
import useStormStore from './store'
import { latLonToVec3 } from './utils/geoUtils'

// Smooth ease-in-out (quadratic)
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * Animates the camera to face the selected storm.
 * Temporarily disables OrbitControls during animation so they don't fight.
 */
function CameraFocus({ controlsRef }) {
  const { camera } = useThree()
  const selectedStorm = useStormStore((s) => s.selectedStorm)

  const animRef = useRef({
    active: false,
    progress: 1,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
  })

  useEffect(() => {
    if (!selectedStorm) return
    const [x, y, z] = latLonToVec3(
      selectedStorm.coordinates.lat,
      selectedStorm.coordinates.lon,
      3.0,
    )
    const anim = animRef.current
    anim.startPos.copy(camera.position)
    anim.endPos.set(x, y, z)
    anim.progress = 0
    anim.active = true
    if (controlsRef.current) controlsRef.current.enabled = false
  }, [selectedStorm, camera, controlsRef])

  useFrame((_, delta) => {
    const anim = animRef.current
    if (!anim.active) return

    anim.progress = Math.min(1, anim.progress + delta / 1.5)
    const t = easeInOut(anim.progress)

    camera.position.lerpVectors(anim.startPos, anim.endPos, t)
    camera.lookAt(0, 0, 0)

    if (anim.progress >= 1) {
      anim.active = false
      const ctrl = controlsRef.current
      if (ctrl) {
        // Sync OrbitControls' internal spherical to match new camera position
        const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target)
        ctrl.spherical.setFromVector3(offset)
        ctrl.enabled = true
        ctrl.update()
      }
    }
  })

  return null
}

function Scene() {
  const currentSnapshot = useStormStore((s) => s.currentSnapshot)
  const history = useStormStore((s) => s.history)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const layers = useStormStore((s) => s.layers)

  const controlsRef = useRef()

  const activeSnapshot =
    playbackIndex !== null && history.length > 0
      ? history[Math.min(playbackIndex, history.length - 1)]
      : currentSnapshot

  const storms = activeSnapshot?.storms ?? []
  const windPoints = activeSnapshot?.wind_points ?? []
  const isLive = playbackIndex === null

  return (
    <>
      <StarField />

      {/* Lighting */}
      <ambientLight intensity={0.07} />
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.0}
        castShadow={false}
        color="#d0e8ff"
      />
      <pointLight position={[-10, -5, -10]} intensity={0.3} color="#1e3a5f" />

      {/* Globe + layers */}
      <Globe
        storms={layers.heatmap ? storms : []}
        showHeatmap={layers.heatmap}
        showRainRadar={layers.rainradar}
        autoRotate={isLive}
      />

      {layers.wind && <WindLayer windPoints={windPoints} visible />}
      {layers.storms && <StormMarkers storms={storms} />}
      {layers.airquality && <AirQualityLayer visible={layers.airquality} />}
      <CloudParticles storms={storms} visible />

      {/* Camera focus animation */}
      <CameraFocus controlsRef={controlsRef} />

      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={1.4}
        maxDistance={5}
        rotateSpeed={0.5}
        zoomSpeed={0.6}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  )
}

export default function App() {
  useWebSocket()
  useStormData()

  const viewMode = useStormStore((s) => s.viewMode)
  const setViewMode = useStormStore((s) => s.setViewMode)

  return (
    <div className="app">
      {/* View mode toggle */}
      <div className="view-toggle">
        <button
          className={`view-btn ${viewMode === 'globe' ? 'view-btn--active' : ''}`}
          onClick={() => setViewMode('globe')}
        >
          GLOBE
        </button>
        <button
          className={`view-btn ${viewMode === 'map2d' ? 'view-btn--active' : ''}`}
          onClick={() => setViewMode('map2d')}
        >
          MAP 2D
        </button>
      </div>

      {/* Main view */}
      <div className="canvas-wrap">
        {viewMode === 'globe' ? (
          <Canvas
            camera={{ position: [0, 0, 3.4], fov: 45 }}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.72,
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(new THREE.Color('#010912'))
            }}
          >
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
          </Canvas>
        ) : (
          <Map2D />
        )}
      </div>

      {/* Side panel */}
      <SidePanel />

      {/* Bottom timeline */}
      <Timeline />
    </div>
  )
}
