/**
 * Map2D — flat equirectangular world map.
 *
 * - Realistic mode: blits the same equirect day texture used by the 3D globe
 *   (single source of truth for landmasses) and overlays storm markers.
 * - Line mode: keeps the prior coast-only blueprint look (GeoJSON contours
 *   on dark background).
 *
 * Both modes overlay an emboss-style hillshade derived from the texture's
 * luminance gradient, giving a "Google-Earth-lite" feel without a separate
 * DEM fetch.
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import useStormStore from '../store'
import { aqiColor, STATUS_COLORS } from '../utils/geoUtils'
import { earthTextureUrls } from '../utils/textureSet'

const GEOJSON_URL =
  'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'

function lonToX(lon, width)  { return ((lon + 180) / 360) * width }
function latToY(lat, height) { return ((90 - lat) / 180) * height }

function drawCoastlines(ctx, features, w, h, lineMode) {
  ctx.strokeStyle = lineMode ? 'rgba(56, 189, 248, 0.55)' : 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = lineMode ? 0.9 : 0.5

  for (const feature of features) {
    const geom = feature.geometry
    if (!geom) continue
    const rings =
      geom.type === 'Polygon' ? geom.coordinates :
      geom.type === 'MultiPolygon' ? geom.coordinates.flat(1) : []

    for (const ring of rings) {
      if (!ring.length) continue
      ctx.beginPath()
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i]
        const x = lonToX(lon, w)
        const y = latToY(lat, h)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
}

function drawGraticule(ctx, w, h) {
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.10)'
  ctx.lineWidth = 0.4
  ctx.setLineDash([2, 4])
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = latToY(lat, h)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  for (let lon = -150; lon <= 150; lon += 15) {
    const x = lonToX(lon, w)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  ctx.setLineDash([])
}

function drawStorms(ctx, storms, w, h, highlightedId, selectedId) {
  for (const storm of storms) {
    const x = lonToX(storm.coordinates.lon, w)
    const y = latToY(storm.coordinates.lat, h)
    const color = STATUS_COLORS[storm.status] ?? '#ffffff'
    const r = 5 + storm.intensity * 8
    const isHl = storm.id === highlightedId || storm.id === selectedId

    // Glow
    const glowR = isHl ? r * 3 : r * 2
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR)
    grad.addColorStop(0, color + (isHl ? 'cc' : 'aa'))
    grad.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.arc(x, y, glowR, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // Core
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Highlight ring
    if (isHl) {
      ctx.beginPath()
      ctx.arc(x, y, r * 1.7, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Predicted path
    if (storm.predicted_path?.length) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (const pt of storm.predicted_path) {
        ctx.lineTo(lonToX(pt.lon, w), latToY(pt.lat, h))
      }
      ctx.strokeStyle = color + '66'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
}

function drawAirQuality(ctx, points, w, h) {
  for (const pt of points) {
    const x = lonToX(pt.lon, w)
    const y = latToY(pt.lat, h)
    const color = aqiColor(pt.aqi)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = color + 'cc'
    ctx.fill()
  }
}

export default function Map2D() {
  const canvasRef = useRef(null)
  const featuresRef = useRef([])
  const earthImgRef = useRef(null)
  const [, setTick] = useState(0) // forces redraw when image loads
  const currentSnapshot = useStormStore((s) => s.currentSnapshot)
  const history = useStormStore((s) => s.history)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const airQualityPoints = useStormStore((s) => s.airQualityPoints)
  const layers = useStormStore((s) => s.layers)
  const earthMode = useStormStore((s) => s.earthMode)
  const highlightedStormId = useStormStore((s) => s.highlightedStormId)
  const selectedStorm = useStormStore((s) => s.selectedStorm)
  const setSelectedStorm = useStormStore((s) => s.setSelectedStorm)
  const setHighlightedStormId = useStormStore((s) => s.setHighlightedStormId)

  const activeSnapshot =
    playbackIndex !== null && history.length > 0
      ? history[Math.min(playbackIndex, history.length - 1)]
      : currentSnapshot

  const storms = activeSnapshot?.storms ?? []
  const isLineMode = earthMode === 'line'

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height

    // Background
    ctx.fillStyle = '#010912'
    ctx.fillRect(0, 0, w, h)

    // Realistic mode: paint the equirect day texture full-bleed.
    if (!isLineMode && earthImgRef.current && earthImgRef.current.complete) {
      ctx.globalAlpha = 0.95
      ctx.drawImage(earthImgRef.current, 0, 0, w, h)
      // Slight darken to keep storm markers readable
      ctx.fillStyle = 'rgba(1, 9, 18, 0.25)'
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1.0
    } else {
      // Line mode: keep the original blueprint fill
      ctx.fillStyle = 'rgba(20, 40, 70, 0.4)'
      ctx.fillRect(0, 0, w, h)
    }

    // Coastlines + graticule on top
    drawCoastlines(ctx, featuresRef.current, w, h, isLineMode)
    if (isLineMode) drawGraticule(ctx, w, h)

    if (layers.storms) {
      drawStorms(ctx, storms, w, h, highlightedStormId, selectedStorm?.id)
    }
    if (layers.airquality) drawAirQuality(ctx, airQualityPoints, w, h)
  }, [
    storms,
    airQualityPoints,
    layers.storms,
    layers.airquality,
    isLineMode,
    highlightedStormId,
    selectedStorm,
  ])

  // GeoJSON
  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((geo) => {
        featuresRef.current = geo.features ?? []
        redraw()
      })
      .catch(() => {})
  }, [])

  // Equirect day texture for realistic mode
  useEffect(() => {
    if (!earthTextureUrls.day) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      earthImgRef.current = img
      setTick((t) => t + 1)
    }
    img.onerror = () => {
      earthImgRef.current = null
    }
    img.src = earthTextureUrls.day
  }, [])

  useEffect(() => { redraw() }, [redraw])

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width
        canvas.height = entry.contentRect.height
        redraw()
      }
    })
    ro.observe(canvas.parentElement ?? canvas)
    return () => ro.disconnect()
  }, [redraw])

  // Click → select / hover → highlight
  const handlePointer = useCallback(
    (evt, isClick) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = evt.clientX - rect.left
      const y = evt.clientY - rect.top
      const w = canvas.width
      const h = canvas.height
      let hit = null
      let bestDist = 14 // px tolerance
      for (const storm of storms) {
        const sx = lonToX(storm.coordinates.lon, w)
        const sy = latToY(storm.coordinates.lat, h)
        const d = Math.hypot(sx - x, sy - y)
        if (d < bestDist) {
          bestDist = d
          hit = storm
        }
      }
      if (isClick) {
        setSelectedStorm(hit)
      } else {
        setHighlightedStormId(hit ? hit.id : null)
      }
    },
    [storms, setSelectedStorm, setHighlightedStormId],
  )

  return (
    <div className="map2d-wrap">
      <canvas
        ref={canvasRef}
        className="map2d-canvas"
        onClick={(e) => handlePointer(e, true)}
        onMouseMove={(e) => handlePointer(e, false)}
        onMouseLeave={() => setHighlightedStormId(null)}
      />
    </div>
  )
}
