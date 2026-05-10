/**
 * RealisticEarth — multi-layer photo-realistic Earth.
 *
 * Layers (each optional, gracefully degrades if its texture URL is null):
 *   1. albedo (day) — base color
 *   2. night lights — sampled where the sun is below horizon
 *   3. specular mask — ocean glint
 *   4. normal map — relief shading
 *   5. cloud layer — separate sphere, drifts ~4% faster than the Earth
 *
 * Day/night terminator uses the scene's directional light direction,
 * with a smoothstep band (~0.12 rad) to soften the seam.
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { TextureLoader, ShaderMaterial, Vector3, FrontSide } from 'three'
import * as THREE from 'three'
import { earthTextureUrls } from '../../utils/textureSet'

// 1×1 transparent PNG used as a no-op fallback so useLoader is always called
// with a valid URL (preserves hook order).
const BLANK_TEX_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const earthFragment = /* glsl */ `
  precision highp float;

  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uSpecular;
  uniform sampler2D uNormal;
  uniform vec3  uSunDir;
  uniform float uHasNight;
  uniform float uHasSpecular;
  uniform float uHasNormal;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  void main() {
    vec3 N = normalize(vNormalW);

    if (uHasNormal > 0.5) {
      vec3 nMap = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
      N = normalize(N + nMap * 0.18);
    }

    float NdotL = dot(N, normalize(uSunDir));
    float dayMix = smoothstep(-0.06, 0.06, NdotL);

    vec3 dayCol = texture2D(uDay, vUv).rgb;

    vec3 nightCol = vec3(0.0);
    if (uHasNight > 0.5) {
      nightCol = texture2D(uNight, vUv).rgb * 1.6 * (1.0 - dayMix);
    }

    // Warm tint at the terminator
    vec3 terminatorTint = vec3(1.0, 0.75, 0.55);
    float terminatorBand = exp(-pow(NdotL * 6.0, 2.0)) * 0.35;
    dayCol = mix(dayCol, dayCol * terminatorTint, terminatorBand);

    vec3 baseCol = dayCol * dayMix + nightCol;

    if (uHasSpecular > 0.5) {
      float specMask = texture2D(uSpecular, vUv).r;
      vec3 H = normalize(uSunDir + vViewDirW);
      float specPow = pow(max(dot(N, H), 0.0), 50.0);
      baseCol += vec3(0.45, 0.6, 0.85) * specPow * specMask * dayMix * 0.7;
    }

    // Atmospheric rim
    float rim = pow(1.0 - max(dot(N, vViewDirW), 0.0), 2.5);
    baseCol += vec3(0.25, 0.55, 0.95) * rim * 0.18 * dayMix;

    gl_FragColor = vec4(baseCol, uOpacity);
  }
`

const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const cloudFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uClouds;
  uniform vec3  uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vec4 c = texture2D(uClouds, vUv);
    float alpha = max(c.r, c.a);
    float NdotL = dot(normalize(vNormalW), normalize(uSunDir));
    float dayMix = smoothstep(-0.1, 0.15, NdotL);
    vec3 col = mix(vec3(0.05, 0.07, 0.1), vec3(1.0), dayMix);
    gl_FragColor = vec4(col, alpha * uOpacity * (0.25 + 0.75 * dayMix));
  }
`

export default function RealisticEarth({
  rotationRef,
  opacity = 1.0,
  opacityFromRef = null,
  visible = true,
  showClouds = true,
}) {
  const earthRef = useRef()
  const cloudRef = useRef()
  const { scene } = useThree()

  // Always call useLoader with a string URL so hook order is stable.
  // BLANK_TEX_URL is a 1×1 transparent PNG used when the layer is disabled.
  const hasNight = !!earthTextureUrls.night
  const hasClouds = !!earthTextureUrls.clouds && showClouds
  const hasNormal = !!earthTextureUrls.normal
  const hasSpec = !!earthTextureUrls.specular

  const dayTex = useLoader(TextureLoader, earthTextureUrls.day)
  const nightTex = useLoader(TextureLoader, earthTextureUrls.night || BLANK_TEX_URL)
  const cloudTex = useLoader(TextureLoader, earthTextureUrls.clouds || BLANK_TEX_URL)
  const normalTex = useLoader(TextureLoader, earthTextureUrls.normal || BLANK_TEX_URL)
  const specTex = useLoader(TextureLoader, earthTextureUrls.specular || BLANK_TEX_URL)

  const sunDir = useMemo(() => new Vector3(5, 3, 5).normalize(), [])

  const earthMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: {
        uDay: { value: dayTex },
        uNight: { value: nightTex },
        uSpecular: { value: specTex },
        uNormal: { value: normalTex },
        uSunDir: { value: sunDir.clone() },
        uHasNight: { value: hasNight ? 1.0 : 0.0 },
        uHasSpecular: { value: hasSpec ? 1.0 : 0.0 },
        uHasNormal: { value: hasNormal ? 1.0 : 0.0 },
        uOpacity: { value: opacity },
      },
      transparent: opacity < 1.0,
      depthWrite: opacity >= 0.999,
      side: FrontSide,
    })
  }, [dayTex, nightTex, specTex, normalTex, sunDir, hasNight, hasSpec, hasNormal])

  const cloudMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      uniforms: {
        uClouds: { value: cloudTex },
        uSunDir: { value: sunDir.clone() },
        uOpacity: { value: 0.85 * opacity },
      },
      transparent: true,
      depthWrite: false,
      side: FrontSide,
    })
  }, [cloudTex, sunDir])

  useEffect(() => {
    if (earthMaterial) {
      earthMaterial.uniforms.uOpacity.value = opacity
      earthMaterial.transparent = opacity < 1.0
      earthMaterial.depthWrite = opacity >= 0.999
      earthMaterial.needsUpdate = true
    }
    if (cloudMaterial) {
      cloudMaterial.uniforms.uOpacity.value = 0.85 * opacity
    }
  }, [opacity, earthMaterial, cloudMaterial])

  useFrame(() => {
    let dlight = null
    scene.traverse((obj) => {
      if (!dlight && obj.isDirectionalLight) dlight = obj
    })
    if (dlight) {
      const v = new THREE.Vector3()
      dlight.getWorldPosition(v).normalize()
      earthMaterial.uniforms.uSunDir.value.copy(v)
      cloudMaterial.uniforms.uSunDir.value.copy(v)
    }

    // Opacity driven by parent ref (cross-fade) — mutate uniform each frame.
    const op = opacityFromRef ? opacityFromRef.current : opacity
    earthMaterial.uniforms.uOpacity.value = op
    earthMaterial.transparent = op < 0.999
    earthMaterial.depthWrite = op >= 0.999
    cloudMaterial.uniforms.uOpacity.value = 0.85 * op

    // Hide entirely when fully faded so it stops eating draw time
    const meshVisible = op > 0.005
    if (earthRef.current) earthRef.current.visible = meshVisible
    if (cloudRef.current) cloudRef.current.visible = meshVisible

    const rot = rotationRef?.current ?? 0
    if (earthRef.current) earthRef.current.rotation.y = rot
    if (cloudRef.current) cloudRef.current.rotation.y = rot * 1.04
  })

  if (!visible) return null

  return (
    <group>
      <mesh ref={earthRef} material={earthMaterial}>
        <sphereGeometry args={[1.0, 96, 96]} />
      </mesh>

      {hasClouds && (
        <mesh ref={cloudRef} material={cloudMaterial}>
          <sphereGeometry args={[1.012, 64, 64]} />
        </mesh>
      )}
    </group>
  )
}
