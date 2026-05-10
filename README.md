# Radaropadow — Real-Time Global Storm Tracker

A full-stack weather intelligence system with 3D globe visualization, real-time storm detection, and 24-hour historical playback.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Three.js)             │
│   Canvas (WebGL)          SidePanel           Timeline         │
│  ┌──────────────┐   ┌───────────────────┐  ┌──────────────┐   │
│  │  Globe       │   │ Stats / Alerts    │  │ 24h Scrubber │   │
│  │  Atmosphere  │   │ Storm list        │  │ Playback     │   │
│  │  Heatmap     │   │ Layer toggles     │  └──────────────┘   │
│  │  StormMarkers│   └───────────────────┘                     │
│  │  WindArrows  │                                              │
│  │  Clouds      │   Zustand Store ←── WebSocket (WS)          │
│  └──────────────┘             │        REST /api/*             │
└──────────────────────────────────────────────────────────────-─┘
                                │
                    HTTP + WebSocket
                                │
┌───────────────────────────────▼───────────────────────────────┐
│                     BACKEND (FastAPI / Python)                 │
│                                                               │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ WeatherFetch │  │  StormDetector  │  │   DataStore     │  │
│  │  OWM / NOAA  │  │  FORMING        │  │  Redis TimeSer. │  │
│  │  + Mock gen  │  │  ACTIVE         │  │  24h history    │  │
│  └──────┬───────┘  │  SEVERE         │  └────────┬────────┘  │
│         │          │  DISSIPATING    │           │            │
│         └──────────►  ML path pred. ├───────────►  WS Bcast  │
│                    └─────────────────┘                        │
└───────────────────────────────────────────────────────────────┘
                                │
                           Redis 7
```

---

## Quick Start

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env
# Optionally add your API keys to .env
docker-compose up --build
```

- Frontend: http://localhost:3000  
- API docs: http://localhost:8000/docs  

### Option B — Local development

**Backend**

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # edit if you have API keys
uvicorn main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

> Redis is optional — the backend falls back to in-memory storage if Redis is unavailable.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/storms/current` | Latest snapshot (storms, wind, zones) |
| GET | `/api/storms/history?hours=24` | Time-series snapshots for playback |
| GET | `/api/wind-map` | Current global wind field |
| GET | `/api/storm-zones` | Aggregated risk zones |
| GET | `/api/health` | System health check |
| WS | `/ws` | Live push of snapshots + alerts |

---

## Storm Detection Logic

```
Observations → is_storm_candidate() filter
            → distance-based clustering (400 km radius)
            → per-cluster classification:
               wind ≥ 120 km/h  OR  pressure < 980 hPa  → SEVERE
               wind ≥  90 km/h  OR  pressure < 995 hPa  → ACTIVE
               wind ≥  60 km/h  OR  thunderstorm code   → FORMING
               wind dropped 25% vs previous cycle       → DISSIPATING
```

### Trajectory Prediction
ACTIVE and SEVERE storms get a 6-step × 3h path prediction using a simple
advection model: the storm center is advected in the direction of the mean
wind at ~12% of wind speed (empirically tuned for tropical systems).

---

## Data Sources

| Source | Coverage | Requires Key |
|--------|----------|-------------|
| OpenWeatherMap | Global (40+ grid points) | Yes — free tier available |
| NOAA weather.gov | US stations (10 ASOS) | No |
| Mock generator | Global fallback | No |

The mock generator produces physically plausible, time-varying data using
sinusoidal noise — the app is fully functional without any API key.

---

## Frontend Layers (toggleable)

| Layer | Description |
|-------|-------------|
| **Storms** | Animated markers (pulsing rings, lightning flashes, sync-highlight from side panel) |
| **Wind** | Instanced arrow mesh, color-coded by speed |
| **Heatmap** | Custom GLSL fragment shader sampling a DataTexture |
| **Paths** | Dashed line segments for predicted storm trajectories |
| **Clouds** | Animated point particles clustered around storms + separate cloud sphere in realistic mode |
| **Atmosphere** | Fresnel-based atmospheric glow shader |
| **Stars** | Background star field for depth |

### Earth render styles

The 3D globe and 2D map share a single equirectangular texture set and can be
toggled at runtime via the **EARTH STYLE** section of the side panel.

| Mode | What you see |
|------|--------------|
| **Realistic** | Multi-layer photo-Earth: day albedo + night lights (driven by the directional light), normal-mapped relief, ocean specular, and a separate cloud sphere drifting ~4% faster than the surface. |
| **Line / Topo** | Blueprint look: same albedo as luminance source for the landmass mask, lat/lon graticule every 15°, and contour lines from a DEM if provided (procedural fBm fallback otherwise). |

Both modes are mounted simultaneously and cross-faded over 0.6s when toggled,
so there is no Suspense flash.

### Texture pipeline

By default the app pulls a CORS-friendly equirectangular set from
`raw.githubusercontent.com/mrdoob/three.js`, so `npm run dev` shows a fully
textured globe with no asset committed to this repo.

To use your own NASA-grade textures, drop equirectangular 2:1 files into
[`frontend/public/textures/`](frontend/public/textures/README.md) and set:

```
VITE_EARTH_TEXTURE_BASE=/textures
```

Recognized filenames: `earth_day.jpg`, `earth_night.jpg`, `earth_clouds.png`,
`earth_normal.jpg`, `earth_specular.jpg`, `earth_dem.jpg` (optional). Missing
layers degrade gracefully (no night → uniform dark side, no DEM → procedural
contours, etc.). See [`frontend/.env.example`](frontend/.env.example) for full
env reference and [`frontend/public/textures/README.md`](frontend/public/textures/README.md)
for source recommendations.

> ⚠ Hemisphere renders (e.g. orthographic shots from orbit) are **not**
> equirectangular and will distort heavily at the poles — use 2:1 maps only.

---

## Configuration

All settings are in `backend/config.py` and can be overridden via env vars:

```
OPENWEATHERMAP_API_KEY   OWM API key (optional)
NOAA_TOKEN               NOAA CDO token (optional, unused currently)
REDIS_URL                redis://host:port (default: redis://localhost:6379)
DATA_REFRESH_INTERVAL    Seconds between fetches (default: 300)
HISTORY_TTL              Seconds of history to retain (default: 86400)
WIND_FORMING_KMH         60.0
WIND_ACTIVE_KMH          90.0
WIND_SEVERE_KMH          120.0
```

---

## Tech Stack

**Backend**
- Python 3.12 + FastAPI 0.111
- httpx (async HTTP to weather APIs)
- Redis 7 with sorted-set time-series storage
- APScheduler-style asyncio background task
- WebSocket broadcast via FastAPI native WS

**Frontend**
- React 18 + Vite
- Three.js 0.165 via `@react-three/fiber`
- `@react-three/drei` (OrbitControls, Html)
- Zustand for global state
- Custom GLSL shaders (atmosphere glow, heatmap overlay)
- InstancedMesh for GPU-efficient wind arrows
- DataTexture for heatmap without canvas overhead

**Infrastructure**
- Redis 7 (time-series with ZSET)
- Docker Compose (redis + backend + nginx/frontend)
- nginx reverse proxy for WS + API in production
