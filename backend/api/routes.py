from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from models.air_quality import AirQualityPoint
from models.storm import StormRecord, StormZone, WeatherSnapshot, WindPoint
from services.rainviewer_fetcher import RainViewerFetcher

_rainviewer = RainViewerFetcher()

router = APIRouter()


def _store(request: Request):
    return request.app.state.store


# ------------------------------------------------------------------
# /storms/current
# ------------------------------------------------------------------

@router.get("/storms/current", response_model=WeatherSnapshot, tags=["Storms"])
async def get_current_storms(request: Request):
    """Latest detected storms, wind map and storm zones."""
    snapshot = await _store(request).get_current_snapshot()
    if not snapshot:
        raise HTTPException(status_code=503, detail="No data available yet. Please wait for the first data fetch.")
    return snapshot


# ------------------------------------------------------------------
# /storms/history
# ------------------------------------------------------------------

@router.get("/storms/history", response_model=List[WeatherSnapshot], tags=["Storms"])
async def get_storm_history(
    request: Request,
    hours: int = Query(default=24, ge=1, le=24, description="How many hours back to retrieve"),
):
    """Time-series snapshots for playback. Returns up to 24h of history."""
    history = await _store(request).get_history(hours=hours)
    return history


# ------------------------------------------------------------------
# /wind-map
# ------------------------------------------------------------------

@router.get("/wind-map", response_model=List[WindPoint], tags=["Wind"])
async def get_wind_map(request: Request):
    """Current global wind field as a set of vector points."""
    points = await _store(request).get_current_wind()
    return points


# ------------------------------------------------------------------
# /storm-zones
# ------------------------------------------------------------------

@router.get("/storm-zones", response_model=List[StormZone], tags=["Storms"])
async def get_storm_zones(request: Request):
    """Aggregated risk zones derived from active storms."""
    snapshot = await _store(request).get_current_snapshot()
    if not snapshot:
        raise HTTPException(status_code=503, detail="No data available yet.")
    return snapshot.storm_zones


# ------------------------------------------------------------------
# /rainviewer-tiles
# ------------------------------------------------------------------

@router.get("/rainviewer-tiles", tags=["Radar"])
async def get_rainviewer_tiles() -> Dict[str, Any]:
    """RainViewer tile metadata for the frontend to render its own tile layer."""
    data = await _rainviewer.fetch()
    if not data:
        raise HTTPException(status_code=503, detail="RainViewer data unavailable.")
    return data


# ------------------------------------------------------------------
# /air-quality
# ------------------------------------------------------------------

@router.get("/air-quality", response_model=List[AirQualityPoint], tags=["Air Quality"])
async def get_air_quality(request: Request):
    """Current air quality points from the latest ingestion snapshot."""
    snapshot = await _store(request).get_current_snapshot()
    if not snapshot:
        raise HTTPException(status_code=503, detail="No data available yet.")
    return snapshot.air_quality


# ------------------------------------------------------------------
# /health
# ------------------------------------------------------------------

@router.get("/health", tags=["System"])
async def health(request: Request):
    redis_ok = await _store(request).ping()
    snapshot = await _store(request).get_current_snapshot()
    return {
        "status": "ok",
        "redis": "connected" if redis_ok else "fallback (in-memory)",
        "last_update": snapshot.timestamp.isoformat() if snapshot else None,
        "storm_count": len(snapshot.storms) if snapshot else 0,
    }
