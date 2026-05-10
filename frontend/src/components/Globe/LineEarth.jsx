/**
 * LineEarth — blueprint / line-art Earth.
 *
 * Reuses the same equirectangular day texture as RealisticEarth (single
 * source of truth for landmasses), and overlays a procedural / DEM-driven
 * contour grid via StylizedEarthShader.
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader, ShaderMaterial, FrontSide } from 'three'
import { stylizedVertex, stylizedFragment } from './StylizedEarthShader'
import { earthTextureUrls } from '../../utils/textureSet'

const BLANK_TEX_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

export default function LineEarth({
  rotationRef,
  opacity = 1.0,
  opacityFromRef = null,
  visible = true,
}) {
  const meshRef = useRef()
  const startRef = useRef(performance.now() / 1000)

  const dayTex = useLoader(TextureLoader, earthTextureUrls.day)
  const demTex = useLoader(TextureLoader, earthTextureUrls.dem || BLANK_TEX_URL)
  const hasDem = !!earthTextureUrls.dem

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: stylizedVertex,
        fragmentShader: stylizedFragment,
        uniforms: {
          uDay: { value: dayTex },
          uDem: { value: demTex },
          uHasDem: { value: hasDem ? 1.0 : 0.0 },
          uOpacity: { value: opacity },
          uTime: { value: 0 },
        },
        transparent: opacity < 1.0,
        depthWrite: opacity >= 0.999,
        side: FrontSide,
      }),
    [dayTex, demTex, hasDem],
  )

  useEffect(() => {
    material.uniforms.uOpacity.value = opacity
    material.transparent = opacity < 1.0
    material.depthWrite = opacity >= 0.999
    material.needsUpdate = true
  }, [opacity, material])

  useFrame(() => {
    const t = performance.now() / 1000 - startRef.current
    material.uniforms.uTime.value = t

    const op = opacityFromRef ? opacityFromRef.current : opacity
    material.uniforms.uOpacity.value = op
    material.transparent = op < 0.999
    material.depthWrite = op >= 0.999
    if (meshRef.current) meshRef.current.visible = op > 0.005

    const rot = rotationRef?.current ?? 0
    if (meshRef.current) meshRef.current.rotation.y = rot
  })

  if (!visible) return null

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[1.0, 96, 96]} />
    </mesh>
  )
}
