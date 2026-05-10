/**
 * Earth texture URL resolver.
 *
 * Reads VITE_EARTH_TEXTURE_BASE + per-layer filename overrides from env,
 * falls back to the public three.js R165 texture set.
 *
 * Returns absolute URLs, so the same code path works whether
 * textures are served from `/textures/...` (local) or a remote CDN.
 */

const DEFAULT_BASE =
  'https://raw.githubusercontent.com/mrdoob/three.js/r165/examples/textures/planets'

const BASE = (import.meta.env.VITE_EARTH_TEXTURE_BASE || DEFAULT_BASE).replace(
  /\/$/,
  '',
)

const LOCAL_DEFAULTS = {
  day: 'earth_day.jpg',
  night: 'earth_night.jpg',
  clouds: 'earth_clouds.png',
  normal: 'earth_normal.jpg',
  specular: 'earth_specular.jpg',
  dem: 'earth_dem.jpg',
}

const REMOTE_DEFAULTS = {
  day: 'earth_atmos_2048.jpg',
  night: 'earth_lights_2048.png',
  clouds: 'earth_clouds_2048.png',
  normal: 'earth_normal_2048.jpg',
  specular: 'earth_specular_2048.jpg',
  dem: null, // three.js bundle has no DEM in this folder
}

const isLocalBase = BASE === '/textures' || BASE.endsWith('/textures')
const filenameDefaults = isLocalBase ? LOCAL_DEFAULTS : REMOTE_DEFAULTS

function pick(envKey, fallback) {
  const v = import.meta.env[envKey]
  return v && v.trim() !== '' ? v.trim() : fallback
}

function url(filename) {
  if (!filename) return null
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename
  }
  return `${BASE}/${filename}`
}

export const earthTextureUrls = {
  day: url(pick('VITE_EARTH_TEXTURE_DAY', filenameDefaults.day)),
  night: url(pick('VITE_EARTH_TEXTURE_NIGHT', filenameDefaults.night)),
  clouds: url(pick('VITE_EARTH_TEXTURE_CLOUDS', filenameDefaults.clouds)),
  normal: url(pick('VITE_EARTH_TEXTURE_NORMAL', filenameDefaults.normal)),
  specular: url(pick('VITE_EARTH_TEXTURE_SPECULAR', filenameDefaults.specular)),
  dem: url(pick('VITE_EARTH_TEXTURE_DEM', filenameDefaults.dem)),
}

export const initialEarthMode =
  (import.meta.env.VITE_EARTH_MODE || 'realistic') === 'line'
    ? 'line'
    : 'realistic'
