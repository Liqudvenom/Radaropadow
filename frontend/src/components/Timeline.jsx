/**
 * Timeline slider component.
 *
 * Shows a scrubber for the last 24 hours of history.
 * null playbackIndex = live mode.
 */
import { useCallback } from 'react'
import { format } from 'date-fns'
import useStormStore from '../store'

export default function Timeline() {
  const history = useStormStore((s) => s.history)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const setPlaybackIndex = useStormStore((s) => s.setPlaybackIndex)

  const isLive = playbackIndex === null

  const handleSliderChange = useCallback(
    (e) => {
      const val = parseInt(e.target.value, 10)
      if (val >= history.length - 1) {
        setPlaybackIndex(null)
      } else {
        setPlaybackIndex(val)
      }
    },
    [history.length, setPlaybackIndex]
  )

  const goLive = useCallback(() => setPlaybackIndex(null), [setPlaybackIndex])

  const activeIndex = isLive ? history.length - 1 : (playbackIndex ?? 0)
  const activeSnapshot = history[activeIndex]

  return (
    <div className="timeline">
      <div className="timeline-header">
        <span className="timeline-label">24H PLAYBACK</span>
        <button
          className={`live-btn ${isLive ? 'live-btn--active' : ''}`}
          onClick={goLive}
        >
          <span className={`live-dot ${isLive ? 'live-dot--pulse' : ''}`} />
          {isLive ? 'LIVE' : 'GO LIVE'}
        </button>
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
