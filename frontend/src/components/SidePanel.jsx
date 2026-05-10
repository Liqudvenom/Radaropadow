/**
 * SidePanel – right-hand dashboard.
 *
 * Live connection · global storm stats · selected storm details +
 * classification transparency · alerts · layer toggles · earth style toggle.
 *
 * Two-way sync with the globe:
 *   - Hovering a storm row pushes `highlightedStormId` into the store, which
 *     drives a pulse on the matching marker in StormMarkers.jsx.
 *   - When `selectedStorm` changes from elsewhere (e.g. clicking a marker
 *     directly on the globe), the corresponding row scrolls into view.
 */
import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import useStormStore from '../store'
import { aqiColor } from '../utils/geoUtils'
import StormListModal from './StormListModal'

const STATUS_BADGE = {
  FORMING:     { label: 'FORMING',     cls: 'badge--forming' },
  ACTIVE:      { label: 'ACTIVE',      cls: 'badge--active' },
  SEVERE:      { label: 'SEVERE',      cls: 'badge--severe' },
  DISSIPATING: { label: 'DISSIPATING', cls: 'badge--dissipating' },
}

// Classification thresholds — kept in sync with backend/services/storm_detector.
// The numbers are documented here so the UI explains the "why" of a status.
const CLASSIFICATION_RULES = [
  { status: 'SEVERE',      wind: '≥ 120 km/h',  pressure: '< 970 hPa',  weatherCode: '95–99 (thunderstorm)' },
  { status: 'ACTIVE',      wind: '80–120 km/h', pressure: '970–990 hPa', weatherCode: '80–82 (heavy rain)' },
  { status: 'FORMING',     wind: '40–80 km/h',  pressure: '990–1000 hPa', weatherCode: '60–67 (rain)' },
  { status: 'DISSIPATING', wind: '< 40 km/h',   pressure: '> 1000 hPa', weatherCode: 'any' },
]

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, cls: '' }
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
}

function WindBar({ speed }) {
  const pct = Math.min(100, (speed / 200) * 100)
  const color = speed > 120 ? '#ef4444' : speed > 80 ? '#f97316' : speed > 50 ? '#facc15' : '#22d3ee'
  return (
    <div className="wind-bar-wrap">
      <div className="wind-bar" style={{ width: `${pct}%`, background: color }} />
      <span className="wind-bar-label">{speed} km/h</span>
    </div>
  )
}

function ClassificationBox({ storm }) {
  // Surface why the storm got its current label, based on the same rules
  // the backend used. This is the "transparency" the prompt asked for.
  const rule = CLASSIFICATION_RULES.find((r) => r.status === storm.status)
  if (!rule) return null
  const sources = storm.observation_count ?? storm.cluster_sources?.length ?? null
  return (
    <div className="classification-box">
      <span className="section-title section-title--sub">CLASSIFICATION</span>
      <div className="classification-row">
        <span className="classification-label">Triggered by</span>
        <span className="classification-value">
          {storm.wind_speed_kmh} km/h · {storm.pressure_hpa} hPa
        </span>
      </div>
      <div className="classification-row">
        <span className="classification-label">{storm.status} thresholds</span>
        <span className="classification-value classification-value--mono">
          wind {rule.wind} · p {rule.pressure}
        </span>
      </div>
      {sources != null && (
        <div className="classification-row">
          <span className="classification-label">Cluster sources</span>
          <span className="classification-value">{sources} obs</span>
        </div>
      )}
      {storm.classification_reason && (
        <p className="classification-reason">{storm.classification_reason}</p>
      )}
    </div>
  )
}

function StormCard({ storm }) {
  return (
    <div className="storm-card">
      <div className="storm-card-header">
        <StatusBadge status={storm.status} />
        <span className="storm-id">{storm.id.slice(0, 12)}</span>
      </div>
      <div className="storm-detail">
        <span className="detail-label">Region</span>
        <span className="detail-value">{storm.region}</span>
      </div>
      <div className="storm-detail">
        <span className="detail-label">Coordinates</span>
        <span className="detail-value">
          {storm.coordinates.lat.toFixed(1)}°{storm.coordinates.lat >= 0 ? 'N' : 'S'}{' '}
          {Math.abs(storm.coordinates.lon).toFixed(1)}°{storm.coordinates.lon >= 0 ? 'E' : 'W'}
        </span>
      </div>
      <div className="storm-detail">
        <span className="detail-label">Wind Speed</span>
        <WindBar speed={storm.wind_speed_kmh} />
      </div>
      <div className="storm-detail">
        <span className="detail-label">Pressure</span>
        <span className="detail-value">{storm.pressure_hpa} hPa</span>
      </div>
      <div className="storm-detail">
        <span className="detail-label">Intensity</span>
        <div className="intensity-bar-wrap">
          <div
            className="intensity-bar"
            style={{
              width: `${(storm.intensity * 100).toFixed(0)}%`,
              background: `hsl(${(1 - storm.intensity) * 120}, 80%, 50%)`,
            }}
          />
          <span className="wind-bar-label">{(storm.intensity * 100).toFixed(0)}%</span>
        </div>
      </div>
      {storm.description && (
        <p className="storm-desc">{storm.description}</p>
      )}
      {storm.predicted_path && storm.predicted_path.length > 0 && (
        <p className="storm-path-hint">
          ⟶ Path predicted ({storm.predicted_path.length} × 3h steps)
        </p>
      )}

      <ClassificationBox storm={storm} />
    </div>
  )
}

function AlertItem({ alert, onDismiss }) {
  return (
    <div className="alert-item">
      <div className="alert-header">
        <span className="alert-severity">{alert.severity}</span>
        <button className="alert-dismiss" onClick={() => onDismiss(alert.id)}>✕</button>
      </div>
      <p className="alert-body">
        <strong>{alert.region}</strong> — {alert.wind_kmh?.toFixed(0)} km/h winds
      </p>
      <span className="alert-time">{format(new Date(alert.ts), 'HH:mm:ss')}</span>
    </div>
  )
}

function LayerToggle({ label, layerKey }) {
  const layers = useStormStore((s) => s.layers)
  const toggleLayer = useStormStore((s) => s.toggleLayer)
  const active = layers[layerKey]
  return (
    <button
      className={`layer-btn ${active ? 'layer-btn--on' : ''}`}
      onClick={() => toggleLayer(layerKey)}
    >
      {label}
    </button>
  )
}

function EarthStyleToggle() {
  const earthMode = useStormStore((s) => s.earthMode)
  const setEarthMode = useStormStore((s) => s.setEarthMode)
  return (
    <div className="earth-style-toggle">
      <button
        className={`layer-btn ${earthMode === 'realistic' ? 'layer-btn--on' : ''}`}
        onClick={() => setEarthMode('realistic')}
      >
        Realistic
      </button>
      <button
        className={`layer-btn ${earthMode === 'line' ? 'layer-btn--on' : ''}`}
        onClick={() => setEarthMode('line')}
      >
        Line / Topo
      </button>
    </div>
  )
}

export default function SidePanel() {
  const wsStatus = useStormStore((s) => s.wsStatus)
  const currentSnapshot = useStormStore((s) => s.currentSnapshot)
  const selectedStorm = useStormStore((s) => s.selectedStorm)
  const setSelectedStorm = useStormStore((s) => s.setSelectedStorm)
  const highlightedStormId = useStormStore((s) => s.highlightedStormId)
  const setHighlightedStormId = useStormStore((s) => s.setHighlightedStormId)
  const alerts = useStormStore((s) => s.alerts)
  const dismissAlert = useStormStore((s) => s.dismissAlert)
  const playbackIndex = useStormStore((s) => s.playbackIndex)
  const history = useStormStore((s) => s.history)
  const airQualityPoints = useStormStore((s) => s.airQualityPoints)
  const layers = useStormStore((s) => s.layers)

  const [stormListOpen, setStormListOpen] = useState(false)
  const selectedRowRef = useRef(null)

  const activeSnapshot = playbackIndex !== null
    ? history[Math.min(playbackIndex, history.length - 1)]
    : currentSnapshot

  const storms = activeSnapshot?.storms ?? []
  const stormsByStatus = {
    SEVERE:      storms.filter((s) => s.status === 'SEVERE'),
    ACTIVE:      storms.filter((s) => s.status === 'ACTIVE'),
    FORMING:     storms.filter((s) => s.status === 'FORMING'),
    DISSIPATING: storms.filter((s) => s.status === 'DISSIPATING'),
  }

  // Scroll the matching list row into view when a storm is selected from the globe
  useEffect(() => {
    if (selectedStorm && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedStorm])

  return (
    <aside className="side-panel">
      <div className="panel-header">
        <div className="panel-logo">
          <span className="panel-logo-icon">⛈</span>
          <span className="panel-logo-text">StormTracker</span>
        </div>
        <div className={`ws-status ws-status--${wsStatus}`}>
          <span className="ws-dot" />
          {wsStatus === 'connected'
            ? 'REAL-TIME'
            : wsStatus === 'connecting'
            ? 'CONNECTING…'
            : 'OFFLINE'}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-box stat-box--severe">
          <span className="stat-val">{stormsByStatus.SEVERE.length}</span>
          <span className="stat-key">SEVERE</span>
        </div>
        <div className="stat-box stat-box--active">
          <span className="stat-val">{stormsByStatus.ACTIVE.length}</span>
          <span className="stat-key">ACTIVE</span>
        </div>
        <div className="stat-box stat-box--forming">
          <span className="stat-val">{stormsByStatus.FORMING.length}</span>
          <span className="stat-key">FORMING</span>
        </div>
        <div className="stat-box stat-box--dissipating">
          <span className="stat-val">{stormsByStatus.DISSIPATING.length}</span>
          <span className="stat-key">DISSIPATING</span>
        </div>
      </div>

      <div className="layer-section">
        <span className="section-title">EARTH STYLE</span>
        <EarthStyleToggle />
      </div>

      <div className="layer-section">
        <span className="section-title">LAYERS</span>
        <div className="layer-buttons">
          <LayerToggle label="Storms" layerKey="storms" />
          <LayerToggle label="Wind" layerKey="wind" />
          <LayerToggle label="Heatmap" layerKey="heatmap" />
          <LayerToggle label="Paths" layerKey="paths" />
          <LayerToggle label="Rain Radar" layerKey="rainradar" />
          <LayerToggle label="Air Quality" layerKey="airquality" />
        </div>
      </div>

      {selectedStorm ? (
        <div className="selected-section">
          <div className="section-title-row">
            <span className="section-title">SELECTED STORM</span>
            <button className="close-btn" onClick={() => setSelectedStorm(null)}>✕</button>
          </div>
          <StormCard storm={selectedStorm} />
        </div>
      ) : (
        <div className="storm-list-section">
          <div className="section-title-row" style={{ padding: '18px 16px 8px 20px' }}>
            <span className="section-title" style={{ padding: 0 }}>STORM LIST</span>
            <button
              className="layer-btn storm-list-open-btn"
              onClick={() => setStormListOpen(true)}
              disabled={storms.length === 0}
            >
              View All ({storms.length})
            </button>
          </div>

          <div className="storm-list">
            {storms.length === 0 && (
              <p className="empty-msg">No storms detected.</p>
            )}
            {storms
              .slice()
              .sort((a, b) => b.intensity - a.intensity)
              .slice(0, 3)
              .map((storm) => {
                const isHighlighted = highlightedStormId === storm.id
                const isSelected = selectedStorm?.id === storm.id
                return (
                  <button
                    key={storm.id}
                    ref={isSelected ? selectedRowRef : null}
                    className={`storm-list-item ${isHighlighted ? 'storm-list-item--hl' : ''}`}
                    onClick={() => setSelectedStorm(storm)}
                    onMouseEnter={() => setHighlightedStormId(storm.id)}
                    onMouseLeave={() => setHighlightedStormId(null)}
                    onFocus={() => setHighlightedStormId(storm.id)}
                    onBlur={() => setHighlightedStormId(null)}
                  >
                    <StatusBadge status={storm.status} />
                    <span className="storm-list-region">{storm.region}</span>
                    <span className="storm-list-wind">{storm.wind_speed_kmh} km/h</span>
                  </button>
                )
              })}
            {storms.length > 3 && (
              <button
                className="storm-list-more-btn"
                onClick={() => setStormListOpen(true)}
              >
                +{storms.length - 3} more storms →
              </button>
            )}
          </div>
        </div>
      )}

      {stormListOpen && (
        <StormListModal
          storms={storms}
          onClose={() => setStormListOpen(false)}
          onSelect={(storm) => {
            setSelectedStorm(storm)
            setStormListOpen(false)
          }}
        />
      )}

      {layers.airquality && airQualityPoints.length > 0 && (
        <div className="aq-section">
          <span className="section-title">AIR QUALITY</span>
          {airQualityPoints
            .sort((a, b) => b.aqi - a.aqi)
            .slice(0, 6)
            .map((pt) => (
              <div className="aq-item" key={pt.station_name}>
                <span className="aq-dot" style={{ background: aqiColor(pt.aqi) }} />
                <span className="aq-name">{pt.station_name}</span>
                <span className="aq-val">{pt.aqi}</span>
                <span className="aq-cat">{pt.category}</span>
              </div>
            ))}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="alerts-section">
          <span className="section-title">⚠ ALERTS</span>
          {alerts.slice(0, 5).map((alert) => (
            <AlertItem key={alert.id} alert={alert} onDismiss={dismissAlert} />
          ))}
        </div>
      )}

      <div className="panel-footer">
        {currentSnapshot && (
          <span>
            Updated: {format(new Date(currentSnapshot.timestamp), 'HH:mm:ss')}
          </span>
        )}
        <span>{storms.length} total storms tracked</span>
      </div>
    </aside>
  )
}
