import { create } from 'zustand'
import { initialEarthMode } from './utils/textureSet'

const useStormStore = create((set, get) => ({
  // Current live snapshot
  currentSnapshot: null,
  // History array (sorted oldest→newest)
  history: [],
  // Which snapshot index is shown (null = live)
  playbackIndex: null,
  // Connection status
  wsStatus: 'connecting',   // 'connecting' | 'connected' | 'disconnected'
  // Alerts queue
  alerts: [],
  // Selected storm
  selectedStorm: null,
  // Storm currently highlighted via hover/keyboard in the side panel
  // (separate from selection so we can show a transient pulse without
  // committing the storm card)
  highlightedStormId: null,
  setHighlightedStormId: (id) => set({ highlightedStormId: id }),
  // Active map layers
  layers: {
    storms: true,
    wind: true,
    heatmap: true,
    paths: true,
    rainradar: true,
    airquality: false,
  },

  // View mode: 3D globe or 2D flat map
  viewMode: 'globe',            // 'globe' | 'map2d'
  setViewMode: (mode) => {
    // Block view-mode swap while a camera fly-to is in progress;
    // otherwise the half-finished animation gets stranded and the
    // OrbitControls re-enable on the wrong scene.
    if (get().cameraLocked) return
    set({ viewMode: mode })
  },

  // Earth render style: 'realistic' (photo) or 'line' (blueprint contour)
  earthMode: initialEarthMode,
  setEarthMode: (mode) => set({ earthMode: mode === 'line' ? 'line' : 'realistic' }),

  // True while a camera fly-to / focus animation is running.
  // Used by OrbitControls + view-mode toggle to avoid fighting the animation.
  cameraLocked: false,
  setCameraLocked: (locked) => set({ cameraLocked: !!locked }),

  // RainViewer tile metadata
  rainviewerData: null,
  setRainviewerData: (d) => set({ rainviewerData: d }),

  // Air quality points from latest snapshot
  airQualityPoints: [],
  setAirQuality: (pts) => set({ airQualityPoints: pts }),

  setCurrentSnapshot: (snapshot) => set({ currentSnapshot: snapshot }),

  addHistorySnapshot: (snapshot) =>
    set((state) => {
      const existing = state.history.find((h) => h.timestamp === snapshot.timestamp)
      if (existing) return {}
      const next = [...state.history, snapshot].slice(-288) // max 288 entries (24h × 5min)
      return { history: next }
    }),

  setHistory: (history) => set({ history }),

  setPlaybackIndex: (index) => set({ playbackIndex: index }),

  setWsStatus: (status) => set({ wsStatus: status }),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [{ ...alert, id: Date.now() }, ...state.alerts].slice(0, 20),
    })),

  dismissAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

  setSelectedStorm: (storm) => set({ selectedStorm: storm }),

  toggleLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),

  // The snapshot currently being visualized (live or historical)
  get activeSnapshot() {
    const { currentSnapshot, history, playbackIndex } = get()
    if (playbackIndex !== null && history.length > 0) {
      return history[Math.min(playbackIndex, history.length - 1)] ?? null
    }
    return currentSnapshot
  },
}))

export default useStormStore
