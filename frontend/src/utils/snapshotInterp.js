/**
 * snapshotInterp — interpolate storm positions/intensity between two snapshots.
 *
 * The Timeline slider snaps to whole 5-minute steps; replaying it at frame
 * rate would be jerky. This helper produces a synthetic snapshot at fractional
 * index `idx + frac` (0 ≤ frac ≤ 1) so the globe animates smoothly between
 * recorded ticks.
 *
 * Storms that exist only in one of the two snapshots fade in/out via intensity.
 */

function lerp(a, b, t) {
  return a + (b - a) * t
}

function lerpAngleDeg(a, b, t) {
  // Wrap-aware lerp for compass bearings (0..360)
  let diff = ((b - a + 540) % 360) - 180
  return (a + diff * t + 360) % 360
}

function lerpStorm(a, b, t) {
  return {
    ...b,
    coordinates: {
      lat: lerp(a.coordinates.lat, b.coordinates.lat, t),
      lon: lerpAngleDeg(a.coordinates.lon + 180, b.coordinates.lon + 180, t) - 180,
    },
    wind_speed_kmh: lerp(a.wind_speed_kmh, b.wind_speed_kmh, t),
    pressure_hpa: lerp(a.pressure_hpa, b.pressure_hpa, t),
    intensity: lerp(a.intensity, b.intensity, t),
    wind_direction_deg: lerpAngleDeg(a.wind_direction_deg, b.wind_direction_deg, t),
  }
}

/**
 * @param {object} prev  earlier snapshot
 * @param {object} next  later snapshot
 * @param {number} t     0 (=prev) .. 1 (=next)
 * @returns {object} synthetic snapshot
 */
export function interpolateSnapshot(prev, next, t) {
  if (!prev) return next
  if (!next) return prev
  if (t <= 0) return prev
  if (t >= 1) return next

  const prevById = new Map((prev.storms ?? []).map((s) => [s.id, s]))
  const nextById = new Map((next.storms ?? []).map((s) => [s.id, s]))

  const allIds = new Set([...prevById.keys(), ...nextById.keys()])
  const storms = []

  for (const id of allIds) {
    const a = prevById.get(id)
    const b = nextById.get(id)
    if (a && b) {
      storms.push(lerpStorm(a, b, t))
    } else if (a) {
      // Storm disappeared — fade intensity out
      storms.push({ ...a, intensity: a.intensity * (1 - t) })
    } else if (b) {
      // Storm appeared — fade intensity in
      storms.push({ ...b, intensity: b.intensity * t })
    }
  }

  return {
    ...next,
    timestamp: new Date(
      lerp(new Date(prev.timestamp).getTime(), new Date(next.timestamp).getTime(), t),
    ).toISOString(),
    storms,
    wind_points: t < 0.5 ? prev.wind_points ?? [] : next.wind_points ?? [],
    storm_zones: next.storm_zones ?? prev.storm_zones ?? [],
    active_count: Math.round(lerp(prev.active_count ?? 0, next.active_count ?? 0, t)),
    severe_count: Math.round(lerp(prev.severe_count ?? 0, next.severe_count ?? 0, t)),
  }
}

/**
 * Pick the right pair from history given a fractional index.
 * @param {object[]} history  snapshots, oldest first
 * @param {number}   fIdx     fractional index, e.g. 12.4
 */
export function snapshotAtFractional(history, fIdx) {
  if (!history || history.length === 0) return null
  if (fIdx <= 0) return history[0]
  if (fIdx >= history.length - 1) return history[history.length - 1]
  const i = Math.floor(fIdx)
  const frac = fIdx - i
  return interpolateSnapshot(history[i], history[i + 1], frac)
}
