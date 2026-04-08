/**
 * Geographic utility functions for 3D globe projection.
 * Coordinate system: right-handed, Y-up.
 * Earth is a unit sphere scaled by GLOBE_RADIUS.
 */

export const GLOBE_RADIUS = 1.0

/**
 * Convert geographic coordinates to 3D Cartesian position on sphere surface.
 */
export function latLonToVec3(lat, lon, radius = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180)   // polar angle from +Y
  const theta = (lon + 180) * (Math.PI / 180) // azimuthal angle

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  ]
}

/**
 * Bearing-to-tangent vector on sphere surface (used for wind arrows).
 */
export function bearingToTangent(lat, lon, bearing_deg) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const b = bearing_deg * (Math.PI / 180)

  // North direction in 3D
  const nx = -Math.cos(phi) * Math.cos(theta)
  const ny = -Math.sin(phi)
  const nz = Math.cos(phi) * Math.sin(theta)

  // East direction in 3D
  const ex = Math.sin(theta)
  const ey = 0
  const ez = Math.cos(theta)

  return [
    nx * Math.cos(b) + ex * Math.sin(b),
    ny * Math.cos(b) + ey * Math.sin(b),
    nz * Math.cos(b) + ez * Math.sin(b),
  ]
}

/**
 * Map storm intensity [0,1] to an RGB color.
 * Low  → blue
 * Mid  → yellow
 * High → red
 */
export function intensityToColor(intensity) {
  const t = Math.max(0, Math.min(1, intensity))
  if (t < 0.5) {
    const f = t / 0.5
    return [f, f * 0.8, 1 - f]  // blue → yellow
  }
  const f = (t - 0.5) / 0.5
  return [1, 0.8 * (1 - f), 0]  // yellow → red
}

export const STATUS_COLORS = {
  FORMING:     '#facc15',  // yellow
  ACTIVE:      '#f97316',  // orange
  SEVERE:      '#ef4444',  // red
  DISSIPATING: '#64748b',  // slate
}

export const STATUS_GLOW = {
  FORMING:     '#fef08a',
  ACTIVE:      '#fdba74',
  SEVERE:      '#fca5a5',
  DISSIPATING: '#94a3b8',
}

/**
 * AQI index → hex color following EPA scale.
 */
export function aqiColor(aqi) {
  if (aqi <= 50)  return '#00e400'
  if (aqi <= 100) return '#ffff00'
  if (aqi <= 150) return '#ff7e00'
  if (aqi <= 200) return '#ff0000'
  if (aqi <= 300) return '#8f3f97'
  return '#7e0023'
}
