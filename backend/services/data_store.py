"""
Redis-backed time-series store.

Data layout:
  storms:current          → JSON blob (latest snapshot)
  storms:history          → Sorted set  score=unix_ts  member=JSON snapshot
  wind:current            → JSON blob (latest wind points)

All history entries older than 24 h are auto-pruned on each write.
"""
import json
import logging
import time
from typing import Any, Dict, List, Optional

import redis.asyncio as aioredis

from config import settings
from models.storm import StormRecord, StormZone, WeatherSnapshot, WindPoint

logger = logging.getLogger(__name__)


def _serialize(obj: Any) -> str:
    if hasattr(obj, "model_dump"):
        return json.dumps(obj.model_dump(mode="json"))
    return json.dumps(obj)


class DataStore:
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._fallback: Dict[str, Any] = {}  # in-memory when Redis unavailable

    async def connect(self) -> None:
        try:
            self._redis = aioredis.from_url(
                settings.redis_url, decode_responses=True, socket_connect_timeout=3
            )
            await self._redis.ping()
            logger.info("Connected to Redis at %s", settings.redis_url)
        except Exception as e:
            logger.warning("Redis unavailable (%s). Using in-memory fallback.", e)
            self._redis = None

    async def disconnect(self) -> None:
        if self._redis:
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def save_snapshot(self, snapshot: WeatherSnapshot) -> None:
        payload = snapshot.model_dump_json()
        ts = snapshot.timestamp.timestamp()

        if self._redis:
            pipe = self._redis.pipeline()
            pipe.set("storms:current", payload)
            pipe.set("wind:current", json.dumps([p.model_dump() for p in snapshot.wind_points]))
            pipe.zadd("storms:history", {payload: ts})
            cutoff = ts - settings.history_ttl
            pipe.zremrangebyscore("storms:history", "-inf", cutoff)
            await pipe.execute()
        else:
            self._fallback["storms:current"] = payload
            self._fallback["wind:current"] = json.dumps(
                [p.model_dump() for p in snapshot.wind_points]
            )
            hist: list = self._fallback.setdefault("storms:history", [])
            hist.append((ts, payload))
            cutoff = ts - settings.history_ttl
            self._fallback["storms:history"] = [(t, p) for t, p in hist if t >= cutoff]

    # ------------------------------------------------------------------
    # Read – current
    # ------------------------------------------------------------------

    async def get_current_snapshot(self) -> Optional[WeatherSnapshot]:
        raw = None
        if self._redis:
            raw = await self._redis.get("storms:current")
        else:
            raw = self._fallback.get("storms:current")

        if not raw:
            return None
        try:
            return WeatherSnapshot.model_validate_json(raw)
        except Exception as e:
            logger.error("Failed to parse current snapshot: %s", e)
            return None

    async def get_current_wind(self) -> List[WindPoint]:
        raw = None
        if self._redis:
            raw = await self._redis.get("wind:current")
        else:
            raw = self._fallback.get("wind:current")

        if not raw:
            return []
        try:
            return [WindPoint(**p) for p in json.loads(raw)]
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Read – history
    # ------------------------------------------------------------------

    async def get_history(self, hours: int = 24) -> List[WeatherSnapshot]:
        now = time.time()
        cutoff = now - hours * 3600

        entries: List[str] = []
        if self._redis:
            entries = await self._redis.zrangebyscore("storms:history", cutoff, "+inf")
        else:
            hist = self._fallback.get("storms:history", [])
            entries = [p for t, p in hist if t >= cutoff]

        snapshots: List[WeatherSnapshot] = []
        for raw in entries:
            try:
                snapshots.append(WeatherSnapshot.model_validate_json(raw))
            except Exception:
                pass
        return sorted(snapshots, key=lambda s: s.timestamp)

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    async def ping(self) -> bool:
        try:
            if self._redis:
                await self._redis.ping()
                return True
            return False
        except Exception:
            return False
