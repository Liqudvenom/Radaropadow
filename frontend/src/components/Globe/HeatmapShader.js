/**
 * Heatmap overlay shader.
 *
 * The heatmap is rendered as a slightly elevated transparent sphere.
 * Storm intensity data is passed as a DataTexture (uHeatmapData).
 * The fragment shader samples the texture by UV (sphere surface) and
 * outputs a heat color with alpha proportional to intensity.
 */
export const heatmapVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv         = uv;
    vNormal     = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const heatmapFragmentShader = /* glsl */ `
  uniform sampler2D uHeatmapData;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 heatColor(float t) {
    // Black → blue → cyan → green → yellow → red
    vec3 c0 = vec3(0.0, 0.0, 0.5);
    vec3 c1 = vec3(0.0, 0.5, 1.0);
    vec3 c2 = vec3(0.0, 1.0, 0.5);
    vec3 c3 = vec3(1.0, 1.0, 0.0);
    vec3 c4 = vec3(1.0, 0.2, 0.0);

    if (t < 0.25) return mix(c0, c1, t / 0.25);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
    return mix(c3, c4, (t - 0.75) / 0.25);
  }

  void main() {
    float intensity = texture2D(uHeatmapData, vUv).r;
    if (intensity < 0.02) discard;

    vec3 color  = heatColor(intensity);
    float alpha = intensity * uOpacity * 0.75;
    gl_FragColor = vec4(color, alpha);
  }
`
