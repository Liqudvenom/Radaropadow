/**
 * StormListModal – fullscreen overlay with full storm list,
 * live region search, status filter tabs, and sortable columns.
 */
import { useState, useMemo, useEffect, useCallback } from 'react'

const STATUS_BADGE_CFG = {
  FORMING:     { label: 'FORMING',     cls: 'badge--forming' },
  ACTIVE:      { label: 'ACTIVE',      cls: 'badge--active' },
  SEVERE:      { label: 'SEVERE',      cls: 'badge--severe' },
  DISSIPATING: { label: 'DISSIPATING', cls: 'badge--dissipating' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE_CFG[status] ?? { label: status, cls: '' }
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
}

const STATUSES = ['ALL', 'SEVERE', 'ACTIVE', 'FORMING', 'DISSIPATING']
const SORT_KEYS = { intensity: 'intensity', wind: 'wind_speed_kmh', region: 'region' }

function SortIcon({ active, asc }) {
  if (!active) return <span className="sort-icon sort-icon--inactive">↕</span>
  return <span className="sort-icon sort-icon--active">{asc ? '↑' : '↓'}</span>
}

export default function StormListModal({ storms, onClose, onSelect }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState('intensity')
  const [sortAsc, setSortAsc] = useState(false)

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortAsc(a => !a)
        return prev
      }
      setSortAsc(false)
      return key
    })
  }, [])

  const filtered = useMemo(() => {
    let list = [...storms]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s => s.region.toLowerCase().includes(q))
    }

    if (statusFilter !== 'ALL') {
      list = list.filter(s => s.status === statusFilter)
    }

    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'intensity') cmp = a.intensity - b.intensity
      else if (sortKey === 'wind') cmp = a.wind_speed_kmh - b.wind_speed_kmh
      else if (sortKey === 'region') cmp = a.region.localeCompare(b.region)
      return sortAsc ? cmp : -cmp
    })

    return list
  }, [storms, search, statusFilter, sortKey, sortAsc])

  const statusCounts = useMemo(() => {
    const counts = { ALL: storms.length }
    for (const s of STATUSES.slice(1)) {
      counts[s] = storms.filter(st => st.status === s).length
    }
    return counts
  }, [storms])

  function handleSelect(storm) {
    onSelect(storm)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-logo-icon">⛈</span>
            <span className="modal-title">STORM LIST</span>
            <span className="modal-count-badge">{storms.length} total</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Search */}
        <div className="modal-search-bar">
          <span className="modal-search-icon">⌕</span>
          <input
            className="modal-search-input"
            type="text"
            placeholder="Search by region…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="modal-search-clear" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
          )}
        </div>

        {/* Status filters */}
        <div className="modal-filters">
          {STATUSES.map(s => (
            <button
              key={s}
              className={[
                'modal-filter-btn',
                statusFilter === s ? 'modal-filter-btn--active' : '',
                s !== 'ALL' ? `modal-filter-btn--${s.toLowerCase()}` : '',
              ].join(' ')}
              onClick={() => setStatusFilter(s)}
            >
              {s}
              <span className="modal-filter-count">{statusCounts[s]}</span>
            </button>
          ))}
        </div>

        {/* Table header */}
        <div className="modal-table-header">
          <span className="modal-th modal-th--status">Status</span>
          <button className="modal-th modal-th--region" onClick={() => handleSort('region')}>
            Region <SortIcon active={sortKey === 'region'} asc={sortAsc} />
          </button>
          <button className="modal-th modal-th--wind" onClick={() => handleSort('wind')}>
            Wind <SortIcon active={sortKey === 'wind'} asc={sortAsc} />
          </button>
          <button className="modal-th modal-th--intensity" onClick={() => handleSort('intensity')}>
            Intensity <SortIcon active={sortKey === 'intensity'} asc={sortAsc} />
          </button>
        </div>

        {/* Storm rows */}
        <div className="modal-list">
          {filtered.length === 0 && (
            <p className="modal-empty">No storms match the current filters.</p>
          )}
          {filtered.map((storm, i) => (
            <button
              key={storm.id}
              className="modal-row"
              style={{ animationDelay: `${Math.min(i * 18, 300)}ms` }}
              onClick={() => handleSelect(storm)}
            >
              <span className="modal-row-status">
                <StatusBadge status={storm.status} />
              </span>
              <span className="modal-row-region">{storm.region}</span>
              <span className="modal-row-wind">{storm.wind_speed_kmh} km/h</span>
              <span className="modal-row-intensity">
                <span
                  className="modal-intensity-bar"
                  style={{
                    width: `${(storm.intensity * 100).toFixed(0)}%`,
                    background: `hsl(${(1 - storm.intensity) * 120}, 80%, 50%)`,
                  }}
                />
                <span className="modal-intensity-label">{(storm.intensity * 100).toFixed(0)}%</span>
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <span className="modal-footer-hint">Click a row to focus storm · Esc to close</span>
          <span className="modal-footer-count">
            Showing {filtered.length} / {storms.length}
          </span>
        </div>
      </div>
    </div>
  )
}
