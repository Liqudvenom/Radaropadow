import { useEffect, useRef } from 'react'
import useStormStore from '../store'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws'
const RECONNECT_DELAY_MS = 3000
const PING_INTERVAL_MS = 25000

export function useWebSocket() {
  const setCurrentSnapshot = useStormStore((s) => s.setCurrentSnapshot)
  const addHistorySnapshot = useStormStore((s) => s.addHistorySnapshot)
  const addAlert = useStormStore((s) => s.addAlert)
  const setWsStatus = useStormStore((s) => s.setWsStatus)

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const pingTimerRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    function connect() {
      if (!mountedRef.current) return
      setWsStatus('connecting')

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setWsStatus('connected')
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'snapshot') {
            setCurrentSnapshot(msg.payload)
            addHistorySnapshot(msg.payload)
          } else if (msg.type === 'alert') {
            addAlert(msg)
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setWsStatus('disconnected')
        clearInterval(pingTimerRef.current)
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimerRef.current)
      clearInterval(pingTimerRef.current)
      wsRef.current?.close()
    }
  }, [])
}
