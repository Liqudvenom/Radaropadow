import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

import GlobeView from './components/GlobeView'
import SidePanel from './components/SidePanel'
import Timeline from './components/Timeline'
import Map2D from './components/Map2D'

import { useWebSocket } from './hooks/useWebSocket'
import { useStormData } from './hooks/useStormData'
import useStormStore from './store'

export default function App() {
  useWebSocket()
  useStormData()

  const viewMode = useStormStore((s) => s.viewMode)
  const setViewMode = useStormStore((s) => s.setViewMode)
  const cameraLocked = useStormStore((s) => s.cameraLocked)

  return (
    <div className="app">
      {/* View mode toggle */}
      <div className="view-toggle">
        <button
          className={`view-btn ${viewMode === 'globe' ? 'view-btn--active' : ''}`}
          onClick={() => setViewMode('globe')}
          disabled={cameraLocked}
        >
          GLOBE
        </button>
        <button
          className={`view-btn ${viewMode === 'map2d' ? 'view-btn--active' : ''}`}
          onClick={() => setViewMode('map2d')}
          disabled={cameraLocked}
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
              <GlobeView />
            </Suspense>
          </Canvas>
        ) : (
          <Map2D />
        )}
      </div>

      <SidePanel />
      <Timeline />
    </div>
  )
}
