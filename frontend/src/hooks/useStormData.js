import { useEffect } from 'react'
import useStormStore from '../store'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api'

export function useStormData() {
  const setCurrentSnapshot = useStormStore((s) => s.setCurrentSnapshot)
  const setHistory = useStormStore((s) => s.setHistory)

  useEffect(() => {
    async function fetchInitial() {
      try {
        const [currentRes, historyRes] = await Promise.all([
          fetch(`${API_BASE}/storms/current`),
          fetch(`${API_BASE}/storms/history?hours=24`),
        ])

        if (currentRes.ok) {
          const data = await currentRes.json()
          setCurrentSnapshot(data)
        }

        if (historyRes.ok) {
          const data = await historyRes.json()
          setHistory(data)
        }
      } catch (err) {
        console.warn('Failed to fetch initial storm data:', err)
      }
    }

    fetchInitial()
  }, [])
}

export async function fetchHistoryAt(hours) {
  const res = await fetch(`${API_BASE}/storms/history?hours=${hours}`)
  if (!res.ok) return []
  return res.json()
}
