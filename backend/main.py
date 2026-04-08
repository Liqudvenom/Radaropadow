"""
Storm Intelligence API – FastAPI entry point.

Startup sequence:
  1. Connect to Redis (falls back to in-memory)
  2. Run first weather fetch + detection cycle immediately
  3. Schedule subsequent refreshes every DATA_REFRESH_INTERVAL seconds
  4. Mount REST routes and WebSocket endpoint
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from api.websocket import manager, websocket_endpoint
from config import settings
from models.storm import WeatherSnapshot
from services.aqicn_fetcher import AQICNFetcher
from services.data_store import DataStore
from services.storm_detector import StormDetector
from services.weather_fetcher import WeatherFetcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

store = DataStore()
fetcher = WeatherFetcher()
detector = StormDetector()
aqicn_fetcher = AQICNFetcher(settings.aqicn_token)


async def _ingest_cycle() -> None:
    """Fetch → detect → store → broadcast."""
    try:
        logger.info("Starting data ingestion cycle…")
        observations, air_quality_points = await asyncio.gather(
            fetcher.fetch(),
            aqicn_fetcher.fetch(),
        )
        storms, wind_points, zones = detector.detect(observations)

        snapshot = WeatherSnapshot(
            timestamp=datetime.now(timezone.utc),
            storms=storms,
            wind_points=wind_points,
            storm_zones=zones,
            active_count=sum(1 for s in storms if s.status in ("ACTIVE", "SEVERE")),
            severe_count=sum(1 for s in storms if s.status == "SEVERE"),
            air_quality=air_quality_points,
        )

        await store.save_snapshot(snapshot)
        await manager.broadcast_snapshot(snapshot)

        logger.info(
            "Ingestion complete: %d storms (%d active, %d severe), %d wind points",
            len(storms), snapshot.active_count, snapshot.severe_count, len(wind_points),
        )
    except Exception:
        logger.exception("Ingestion cycle failed")


async def _scheduler() -> None:
    while True:
        await asyncio.sleep(settings.data_refresh_interval)
        await _ingest_cycle()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
    app.state.store = store

    # Run first cycle immediately, then start background scheduler
    await _ingest_cycle()
    task = asyncio.create_task(_scheduler())

    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await store.disconnect()


app = FastAPI(
    title="Storm Intelligence API",
    description="Real-time global storm tracking, detection and visualization backend.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.websocket("/ws")
async def ws_route(websocket: WebSocket):
    await websocket_endpoint(websocket)
