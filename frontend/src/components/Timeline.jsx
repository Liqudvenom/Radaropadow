/**
 * Timeline scrubber for the last 24h of history.
 *
 * - Snaps to whole snapshots when the user drags (UX consistency).
 * - Adds a Play button that advances `playbackIndex` smoothly between
 *   recorded ticks at ~1 step per second; the globe interpolates between
 *   adjacent snapshots in GlobeView via snapshotInterp, so playback looks
 *   continuous instead of stepping.
 * - null playbackIndex = live mode.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import useStormStore from '../store'

const PLAY_SPEED_STEPS_PER_SEC = 1.0

export default function Timeline() {
  const history = useStormStore((s) => s.history)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const setPlaybackIndex = useStormStore((s) => s.setPlaybackIndex)

  const [isPlaying, setIsPlaying] = useState(false)
  const lastTickRef = useRef(performance.now())

  const isLive = playbackIndex === null

  const handleSliderChange = useCallback(
    (e) => {
      const val = parseFloat(e.target.value)
      if (val >= history.length - 1) {
        setPlaybackIndex(null)
      } else {
        setPlaybackIndex(val)
      }
    },
    [history.length, setPlaybackIndex],
  )

  const goLive = useCallback(() => {
    setPlaybackIndex(null)
    setIsPlaying(false)
  }, [setPlaybackIndex])

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      if (!p && playbackIndex === null && history.length > 0) {
        // Starting from live → drop into the first historical step
        setPlaybackIndex(0)
      }
      return !p
    })
  }, [playbackIndex, history.length, setPlaybackIndex])

  // Animation loop: advance fractional playbackIndex in fixed steps.
  useEffect(() => {
    if (!isPlaying) return
    let raf
    lastTickRef.current = performance.now()
    const step = (now) => {
      const dt = (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      const cur = useStormStore.getState().playbackIndex
      const len = useStormStore.getState().history.length
      if (cur === null || len === 0) {
        setIsPlaying(false)
        return
      }
      const next = cur + dt * PLAY_SPEED_STEPS_PER_SEC
      if (next >= len - 1) {
        setPlaybackIndex(null)
        setIsPlaying(false)
        return
      }
      setPlaybackIndex(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, setPlaybackIndex])

  const activeIndex = isLive ? history.length - 1 : (playbackIndex ?? 0)
  const activeSnapshot = history[Math.floor(activeIndex)]

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span className="timeline-label">24H PLAYBACK</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`live-btn ${isPlaying ? 'live-btn--active' : ''}`}
            onClick={togglePlay}
            disabled={history.length < 2}
            title={isPlaying ? 'Pause' : 'Play history'}
          >
            {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
          </button>
          <button
            className={`live-btn ${isLive ? 'live-btn--active' : ''}`}
            onClick={goLive}
          >
            <span className={`live-dot ${isLive ? 'live-dot--pulse' : ''}`} />
            {isLive ? 'LIVE' : 'GO LIVE'}
          </button>
        </div>
      </div>

      <div className="timeline-scrubber">
        <span className="timeline-ts">
          {history.length > 0
            ? format(new Date(history[0].timestamp), 'HH:mm')
            : '--:--'}
        </span>

        <input
          type="range"
          min={0}
          max={Math.max(0, history.length - 1)}
          step={0.05}
          value={activeIndex}
          onChange={handleSliderChange}
          className="timeline-slider"
          disabled={history.length === 0}
        />

        <span className="timeline-ts">
          {activeSnapshot
            ? format(new Date(activeSnapshot.timestamp), 'HH:mm')
            : 'NOW'}
        </span>
      </div>

      {activeSnapshot && (
        <div className="timeline-stats">
          <span>{activeSnapshot.storms?.length ?? 0} storms</span>
          <span>{activeSnapshot.active_count ?? 0} active</span>
          <span>{activeSnapshot.severe_count ?? 0} severe</span>
          <span>{format(new Date(activeSnapshot.timestamp), 'dd MMM HH:mm')}</span>
        </div>
      )}
    </div>
  )
}
