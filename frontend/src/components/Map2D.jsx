/**
 * Map2D — flat equirectangular world map using HTML5 Canvas API.
 *
 * - Fetches world GeoJSON on mount, draws continent contours.
 * - Overlays storm markers and air quality dots.
 * - No external map library — pure Canvas 2D.
 */
import { useRef, useEffect, useCallback } from 'react'
import useStormStore from '../store'
import { aqiColor, STATUS_COLORS } from '../utils/geoUtils'

const GEOJSON_URL =
  'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'

function lonToX(lon, width)  { return ((lon + 180) / 360) * width }
function latToY(lat, height) { return ((90 - lat) / 180) * height }

function drawWorld(ctx, features, w, h) {
  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = '#010912'
  ctx.fillRect(0, 0, w, h)

  // Continents fill
  ctx.fillStyle = 'rgba(20, 40, 70, 0.4)'
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
  ctx.lineWidth = 0.5

  for (const feature of features) {
    const geom = feature.geometry
    if (!geom) continue

    const rings =
      geom.type === 'Polygon'
        ? geom.coordinates
        : geom.type === 'MultiPolygon'
        ? geom.coordinates.flat(1)
        : []

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
      ctx.fill()
      ctx.stroke()
    }
  }
}

function drawStorms(ctx, storms, w, h) {
  for (const storm of storms) {
    const x = lonToX(storm.coordinates.lon, w)
    const y = latToY(storm.coordinates.lat, h)
    const color = STATUS_COLORS[storm.status] ?? '#ffffff'
    const r = 5 + storm.intensity * 8

    // Glow
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2)
    grad.addColorStop(0, color + 'aa')
    grad.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.arc(x, y, r * 2, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // Core dot
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

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
  const currentSnapshot = useStormStore((s) => s.currentSnapshot)
  const history = useStormStore((s) => s.history)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const airQualityPoints = useStormStore((s) => s.airQualityPoints)
  const layers = useStormStore((s) => s.layers)

  const activeSnapshot =
    playbackIndex !== null && history.length > 0
      ? history[Math.min(playbackIndex, history.length - 1)]
      : currentSnapshot

  const storms = activeSnapshot?.storms ?? []

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    drawWorld(ctx, featuresRef.current, w, h)
    if (layers.storms) drawStorms(ctx, storms, w, h)
    if (layers.airquality) drawAirQuality(ctx, airQualityPoints, w, h)
  }, [storms, airQualityPoints, layers.storms, layers.airquality])

  // Load GeoJSON once
  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((geo) => {
        featuresRef.current = geo.features ?? []
        redraw()
      })
      .catch(() => {})
  }, [])

  // Redraw on data change
  useEffect(() => { redraw() }, [redraw])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width  = entry.contentRect.width
        canvas.height = entry.contentRect.height
        redraw()
      }
    })
    ro.observe(canvas.parentElement ?? canvas)
    return () => ro.disconnect()
  }, [redraw])

  return (
    <div className="map2d-wrap">
      <canvas ref={canvasRef} className="map2d-canvas" />
    </div>
  )
}
