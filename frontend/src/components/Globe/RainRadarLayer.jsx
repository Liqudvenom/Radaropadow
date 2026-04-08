/**
 * RainRadarLayer
 *
 * Overlays RainViewer radar data as a texture on the globe sphere.
 * Uses z=0 / x=0 / y=0 tile which covers the entire world at 512px.
 *
 * Props:
 *   visible      — show/hide layer
 *   rotationRef  — shared MutableRefObject<number> from Globe to sync Y rotation
 */
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { TextureLoader, AdditiveBlending } from 'three'
import * as THREE from 'three'
import useStormStore from '../../store'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api'

export default function RainRadarLayer({ visible = true, rotationRef }) {
  const meshRef = useRef()
  const [texture, setTexture] = useState(null)
  const setRainviewerData = useStormStore((s) => s.setRainviewerData)

  useEffect(() => {
    if (!visible) return

    async function loadRadar() {
      try {
        const res = await fetch(`${API_BASE}/rainviewer-tiles`)
        if (!res.ok) return
        const data = await res.json()
        setRainviewerData(data)

        // z=0 / x=0 / y=0 covers the entire world
        const tileUrl = `${data.rainviewer_host}${data.latest_path}/512/0/0/0/2/1_1.png`
        const loader = new TextureLoader()
        loader.load(
          tileUrl,
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
            setTexture(tex)
          },
          undefined,
          (err) => console.warn('RainRadarLayer: texture load failed', err)
        )
      } catch (err) {
        console.warn('RainRadarLayer: fetch failed', err)
      }
    }

    loadRadar()
  }, [visible])

  useFrame(() => {
    if (meshRef.current && rotationRef?.current !== undefined) {
      meshRef.current.rotation.y = rotationRef.current
    }
  })

  if (!visible || !texture) return null

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.008, 64, 64]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.65}
        depthWrite={false}
        blending={AdditiveBlending}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}
