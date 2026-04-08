import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader, ShaderMaterial, AdditiveBlending, DataTexture, RGBAFormat, FloatType } from 'three'
import * as THREE from 'three'
import { atmosphereFragmentShader, atmosphereVertexShader } from './AtmosphereShader'
import { heatmapFragmentShader, heatmapVertexShader } from './HeatmapShader'
import { latLonToVec3 } from '../../utils/geoUtils'
import RainRadarLayer from './RainRadarLayer'

const EARTH_TEXTURE = '/R_earth_viirs_1080p.00001_print.jpg'
const HEATMAP_W = 256
const HEATMAP_H = 128

function buildHeatmapTexture(storms) {
  const data = new Float32Array(HEATMAP_W * HEATMAP_H * 4)
  const sigma = 24  // soft, wide plumes

  for (const storm of storms) {
    const u = ((storm.coordinates.lon + 180) / 360) * HEATMAP_W
    const v = ((90 - storm.coordinates.lat) / 180) * HEATMAP_H
    const strength = storm.intensity

    for (let dx = -sigma * 3; dx <= sigma * 3; dx++) {
      for (let dy = -sigma * 3; dy <= sigma * 3; dy++) {
        const px = Math.round(u + dx)
        const py = Math.round(v + dy)
        if (px < 0 || px >= HEATMAP_W || py < 0 || py >= HEATMAP_H) continue
        const dist = Math.sqrt(dx * dx + dy * dy)
        const weight = strength * Math.exp(-(dist * dist) / (2 * sigma * sigma))
        const idx = (py * HEATMAP_W + px) * 4
        data[idx] = Math.min(1, data[idx] + weight)
        data[idx + 3] = 1
      }
    }
  }

  const tex = new DataTexture(data, HEATMAP_W, HEATMAP_H, RGBAFormat, FloatType)
  tex.needsUpdate = true
  return tex
}

export default function Globe({
  storms = [],
  showHeatmap = true,
  showRainRadar = false,
  autoRotate = true,
}) {
  const earthRef = useRef()
  const atmosphereRef = useRef()
  const heatmapRef = useRef()
  const rotationRef = useRef(0)

  const earthTexture = useLoader(TextureLoader, EARTH_TEXTURE)

  const atmosphereMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          uAtmosphereColor: { value: new THREE.Color(0x0a2535) },
          uIntensity: { value: 0.5 },
        },
        blending: AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    []
  )

  const heatmapTexture = useMemo(() => buildHeatmapTexture(storms), [storms])

  const heatmapMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: heatmapVertexShader,
        fragmentShader: heatmapFragmentShader,
        uniforms: {
          uHeatmapData: { value: heatmapTexture },
          uOpacity: { value: showHeatmap ? 0.35 : 0.0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [heatmapTexture, showHeatmap]
  )

  // Update heatmap when storms change
  useEffect(() => {
    if (heatmapRef.current) {
      const newTex = buildHeatmapTexture(storms)
      heatmapRef.current.material.uniforms.uHeatmapData.value = newTex
      heatmapRef.current.material.uniforms.uOpacity.value = showHeatmap ? 0.35 : 0.0
    }
  }, [storms, showHeatmap])

  useFrame((_, delta) => {
    if (!autoRotate) return
    rotationRef.current += delta * 0.012
    if (earthRef.current) earthRef.current.rotation.y = rotationRef.current
    if (atmosphereRef.current) atmosphereRef.current.rotation.y = rotationRef.current
    if (heatmapRef.current) heatmapRef.current.rotation.y = rotationRef.current
  })

  return (
    <group>
      {/* Earth sphere */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[1.0, 64, 64]} />
        <meshPhongMaterial
          map={earthTexture}
          specular={new THREE.Color(0x030303)}
          shininess={1}
        />
      </mesh>

      {/* Atmosphere glow (slightly larger, BackSide) */}
      <mesh ref={atmosphereRef} material={atmosphereMaterial}>
        <sphereGeometry args={[1.025, 64, 64]} />
      </mesh>

      {/* Heatmap overlay */}
      <mesh ref={heatmapRef} material={heatmapMaterial}>
        <sphereGeometry args={[1.005, 64, 64]} />
      </mesh>

      {/* RainViewer radar overlay */}
      <RainRadarLayer visible={showRainRadar} rotationRef={rotationRef} />
    </group>
  )
}
