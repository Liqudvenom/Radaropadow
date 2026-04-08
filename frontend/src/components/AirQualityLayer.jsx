/**
 * AirQualityLayer
 *
 * Fetches /api/air-quality on mount and every 5 minutes,
 * stores results in global Zustand store,
 * and renders colored spheres on the globe at each station's position.
 *
 * Color scale: green → yellow → orange → red → purple → maroon (EPA AQI).
 */
import { useEffect } from 'react'
import { latLonToVec3, aqiColor } from '../utils/geoUtils'
import useStormStore from '../store'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api'
const REFRESH_MS = 5 * 60 * 1000

export default function AirQualityLayer({ visible = false }) {
  const setAirQuality = useStormStore((s) => s.setAirQuality)
  const airQualityPoints = useStormStore((s) => s.airQualityPoints)

  useEffect(() => {
    async function fetchAQ() {
      try {
        const res = await fetch(`${API_BASE}/air-quality`)
        if (!res.ok) return
        const data = await res.json()
        setAirQuality(data)
      } catch {
        // silently ignore — AQ is supplementary data
      }
    }

    fetchAQ()
    const interval = setInterval(fetchAQ, REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  if (!visible || airQualityPoints.length === 0) return null

  return (
    <group>
      {airQualityPoints.map((pt) => {
        const [x, y, z] = latLonToVec3(pt.lat, pt.lon, 1.012)
        const color = aqiColor(pt.aqi)
        return (
          <mesh key={pt.station_name} position={[x, y, z]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} />
          </mesh>
        )
      })}
    </group>
  )
}
