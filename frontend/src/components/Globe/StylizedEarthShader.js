/**
 * StylizedEarthShader — blueprint / line-art Earth.
 *
 * Strategy: sample the same albedo (day) texture as RealisticEarth,
 * convert to luminance, then layer:
 *   - lat/lon graticule (every 15°)
 *   - elevation contour lines from the DEM, if provided; otherwise
 *     procedural fBm + landmass mask derived from the day texture
 *   - cyan-on-deep-navy palette
 *
 * That way the line view uses the same single source of truth (the equirect
 * day texture) as realistic mode, avoiding palette/landmass drift and a
 * separate hand-tuned mesh.
 */

export const stylizedVertex = /* glsl */ `
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

export const stylizedFragment = /* glsl */ `
  precision highp float;

  uniform sampler2D uDay;     // re-used as a luminance source
  uniform sampler2D uDem;     // optional heightmap
  uniform float     uHasDem;
  uniform float     uOpacity;
  uniform float     uTime;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  // 2D hash + value-noise fBm — used when no DEM is supplied
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  // Anti-aliased line: returns 0..1 stripe width based on |fract(x) - 0.5|
  float aaLine(float v, float thickness) {
    float d = abs(fract(v) - 0.5);
    float aa = fwidth(v) * 1.5;
    return 1.0 - smoothstep(thickness - aa, thickness + aa, d);
  }

  // Luminance of the day texture — proxy for landmass (land = brighter than ocean
  // in most NASA Blue Marble–derived maps; the Black Marble inverts this, but the
  // default URL set is Blue Marble).
  float landMask(vec2 uv) {
    vec3 c = texture2D(uDay, uv).rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    return smoothstep(0.18, 0.42, lum);
  }

  void main() {
    vec3 N = normalize(vNormalW);

    // Latitude / longitude in degrees from UV
    float latDeg = (vUv.y - 0.5) * 180.0;
    float lonDeg = (vUv.x - 0.5) * 360.0;

    // Graticule: lines every 15°
    float graticule = max(
      aaLine(latDeg / 15.0, 0.03),
      aaLine(lonDeg / 15.0, 0.03)
    );
    // Equator + prime meridian thicker
    graticule = max(graticule, aaLine(latDeg / 90.0, 0.04));
    graticule = max(graticule, aaLine(lonDeg / 180.0, 0.04));

    float land = landMask(vUv);

    // Elevation field: DEM if supplied, else fBm anchored on the same UV.
    // The fBm is masked by 'land' so contours only appear over continents.
    float elev;
    if (uHasDem > 0.5) {
      elev = texture2D(uDem, vUv).r;
    } else {
      // Domain warp adds organic ridge feel
      vec2 q = vec2(fbm(vUv * 4.0 + uTime * 0.005), fbm(vUv * 4.0 + 5.2));
      elev = fbm(vUv * 6.0 + q * 1.4) * land;
    }

    // Contour lines: stripes at every 0.1 elevation step
    float contour = aaLine(elev * 10.0, 0.045) * land;

    // Coastline: gradient of land mask
    float coast = 1.0 - smoothstep(0.0, 0.01, abs(land - 0.5));

    // Compose colors — blueprint palette
    vec3 ocean = vec3(0.02, 0.05, 0.10);
    vec3 landFill = vec3(0.04, 0.10, 0.18);
    vec3 baseCol = mix(ocean, landFill, land);

    vec3 lineCol = vec3(0.30, 0.90, 1.00);    // cyan
    vec3 coastCol = vec3(0.55, 0.95, 1.00);

    baseCol = mix(baseCol, lineCol * 0.6, graticule * 0.55);
    baseCol = mix(baseCol, lineCol, contour * 0.85);
    baseCol = mix(baseCol, coastCol, coast * 0.9);

    // Rim glow
    float rim = pow(1.0 - max(dot(N, vViewDirW), 0.0), 2.0);
    baseCol += vec3(0.10, 0.50, 0.85) * rim * 0.5;

    gl_FragColor = vec4(baseCol, uOpacity);
  }
`
