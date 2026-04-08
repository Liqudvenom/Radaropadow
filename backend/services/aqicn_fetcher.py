"""
AQICN (World Air Quality Index) data fetcher.

Uses the geo-based feed endpoint — no API key required for a basic token,
but a token is strongly recommended. If AQICN_TOKEN is empty, returns [].

Endpoint: GET https://api.waqi.info/feed/geo:{lat};{lon}/?token={token}

Queries up to MAX_POINTS from GLOBAL_GRID concurrently.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

import httpx

from config import settings
from models.air_quality import AirQualityPoint, _aqi_category
from services.weather_fetcher import GLOBAL_GRID

logger = logging.getLogger(__name__)

MAX_POINTS = 20
FEED_URL = "https://api.waqi.info/feed/geo:{lat};{lon}/"


class AQICNFetcher:
    def __init__(self, token: str):
        self.token = token

    async def _fetch_point(
        self, client: httpx.AsyncClient, lat: float, lon: float
    ) -> Optional[AirQualityPoint]:
        try:
            url = FEED_URL.format(lat=lat, lon=lon)
            r = await client.get(
                url, params={"token": self.token}, timeout=10
            )
            r.raise_for_status()
            body = r.json()

            if body.get("status") != "ok":
                return None

            data = body.get("data", {})
            aqi_raw = data.get("aqi")
            if aqi_raw is None or aqi_raw == "-":
                return None

            aqi = int(aqi_raw)
            iaqi = data.get("iaqi", {})
            city = data.get("city", {})
            geo = city.get("geo", [lat, lon])

            return AirQualityPoint(
                lat=float(geo[0]) if geo else lat,
                lon=float(geo[1]) if geo else lon,
                aqi=aqi,
                pm25=iaqi.get("pm25", {}).get("v") if isinstance(iaqi.get("pm25"), dict) else None,
                no2=iaqi.get("no2", {}).get("v") if isinstance(iaqi.get("no2"), dict) else None,
                station_name=city.get("name", f"{lat:.1f},{lon:.1f}"),
                timestamp=datetime.now(timezone.utc),
                category=_aqi_category(aqi),
            )
        except Exception as e:
            logger.debug("AQICN fetch error (%s,%s): %s", lat, lon, e)
            return None

    async def fetch(self) -> List[AirQualityPoint]:
        if not self.token:
            return []
        grid_sample = GLOBAL_GRID[:MAX_POINTS]
        async with httpx.AsyncClient() as client:
            tasks = [self._fetch_point(client, lat, lon) for lat, lon in grid_sample]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        points = [r for r in results if isinstance(r, AirQualityPoint)]
        logger.info("AQICN: fetched %d air quality points", len(points))
        return points
