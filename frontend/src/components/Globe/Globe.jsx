/**
 * Globe — top-level Earth renderer.
 *
 * Delegates the actual sphere render to one of two layers:
 *   - RealisticEarth (photo, day/night, clouds)
 *   - LineEarth      (blueprint contours)
 *
 * Both are mounted simultaneously and cross-faded via opacity refs
 * driven by `store.earthMode`. The fade runs on useFrame so it doesn't
 * trigger React re-renders during the transition.
 */
import { useRef, useMemo, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, AdditiveBlending, DataTexture, RGBAFormat, FloatType } from 'three'
import * as THREE from 'three'
import { atmosphereFragmentShader, atmosphereVertexShader } from './AtmosphereShader'
import { heatmapFragmentShader, heatmapVertexShader } from './HeatmapShader'
import RainRadarLayer from './RainRadarLayer'
import RealisticEarth from './RealisticEarth'
import LineEarth from './LineEarth'
import useStormStore from '../../store'

const HEATMAP_W = 256
const HEATMAP_H = 128
const FADE_DURATION = 0.6

function buildHeatmapTexture(storms) {
  const data = new Float32Array(HEATMAP_W * HEATMAP_H * 4)
  const sigma = 24

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
  const atmosphereRef = useRef()
  const heatmapRef = useRef()
  const rotationRef = useRef(0)

  // Per-mode opacity refs, mutated each frame (no React rerender).
  const realisticOpacityRef = useRef(1.0)
  const lineOpacityRef = useRef(0.0)

  const earthMode = useStormStore((s) => s.earthMode)

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
    [],
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
    [],
  )

  useEffect(() => {
    if (heatmapRef.current) {
      heatmapRef.current.material.uniforms.uHeatmapData.value = heatmapTexture
      heatmapRef.current.material.uniforms.uOpacity.value = showHeatmap ? 0.35 : 0.0
    }
  }, [heatmapTexture, showHeatmap])

  useFrame((_, delta) => {
    // Auto-rotation (kept on parent so all overlays stay in lockstep)
    if (autoRotate) {
      rotationRef.current += delta * 0.012
    }
    if (atmosphereRef.current) atmosphereRef.current.rotation.y = rotationRef.current
    if (heatmapRef.current) heatmapRef.current.rotation.y = rotationRef.current

    // Cross-fade earth modes
    const targetReal = earthMode === 'line' ? 0.0 : 1.0
    const targetLine = earthMode === 'line' ? 1.0 : 0.0
    const step = delta / FADE_DURATION
    realisticOpacityRef.current = approach(realisticOpacityRef.current, targetReal, step)
    lineOpacityRef.current = approach(lineOpacityRef.current, targetLine, step)
  })

  return (
    <group>
      <Suspense fallback={null}>
        <RealisticEarth rotationRef={rotationRef} opacityFromRef={realisticOpacityRef} />
        <LineEarth rotationRef={rotationRef} opacityFromRef={lineOpacityRef} />
      </Suspense>

      <mesh ref={atmosphereRef} material={atmosphereMaterial}>
        <sphereGeometry args={[1.025, 64, 64]} />
      </mesh>

      <mesh ref={heatmapRef} material={heatmapMaterial}>
        <sphereGeometry args={[1.005, 64, 64]} />
      </mesh>

      <RainRadarLayer visible={showRainRadar} rotationRef={rotationRef} />
    </group>
  )
}

function approach(current, target, step) {
  const diff = target - current
  if (Math.abs(diff) <= step) return target
  return current + Math.sign(diff) * step
}
