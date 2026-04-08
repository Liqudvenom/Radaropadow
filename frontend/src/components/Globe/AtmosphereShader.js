/**
 * Fresnel-based atmosphere glow shader.
 * Deep navy base with a subtle cyan accent on the very edge,
 * giving the "space view" look without a bright halo.
 */
export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const atmosphereFragmentShader = /* glsl */ `
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDir = normalize(-vPosition);
    float fresnel = pow(1.0 - dot(vNormal, viewDir), 3.0);

    // Deep navy → subtle cyan only at the very rim (pow 3 sharpens transition)
    vec3 atmColor = mix(
      vec3(0.04, 0.14, 0.22),
      vec3(0.1,  0.7,  0.9),
      pow(fresnel, 3.0)
    );

    gl_FragColor = vec4(atmColor, fresnel * 0.6 * uIntensity);
  }
`
