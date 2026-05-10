/**
 * navigationUtils — small helpers for camera framing and view-mode swaps.
 */
import { latLonToVec3 } from './geoUtils'

// Sphere radius is 1.0; OrbitControls min/max are tuned around that.
export const CAMERA = {
  MIN_DISTANCE: 1.4,
  MAX_DISTANCE: 5.0,
  // Distance to orbit at when zooming to a storm (a bit further out than min so
  // the marker pulse + tooltip have room).
  STORM_FOCUS_DISTANCE: 2.4,
  // Default home position used by the "reset view" button.
  HOME_POSITION: [0, 0, 3.4],
}

/**
 * Place the camera at `distance` units away from the origin along the
 * outward normal of (lat, lon). Used for fly-to-storm.
 */
export function cameraTargetForLatLon(lat, lon, distance = CAMERA.STORM_FOCUS_DISTANCE) {
  return latLonToVec3(lat, lon, distance)
}

/**
 * Clamp a number into [min, max]. Defensive helper for OrbitControls
 * extra constraints we apply ourselves.
 */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Returns true if the current camera distance is "close enough" to the
 * surface that auto-rotation should pause (otherwise the user gets motion
 * sick scrolling close).
 */
export function isCameraClose(camera, threshold = 1.9) {
  if (!camera) return false
  return camera.position.length() <= threshold
}

/**
 * Map a storm's intensity to a fly-to dwell distance.
 * SEVERE storms zoom in tighter than FORMING ones.
 */
export function focusDistanceForStorm(storm) {
  if (!storm) return CAMERA.STORM_FOCUS_DISTANCE
  if (storm.status === 'SEVERE') return 2.05
  if (storm.status === 'ACTIVE') return 2.25
  return CAMERA.STORM_FOCUS_DISTANCE
}
