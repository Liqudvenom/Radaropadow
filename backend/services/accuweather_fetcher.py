"""
AccuWeather current conditions fetcher.

Requires ACCUWEATHER_API_KEY.
If key is empty, fetch_all() returns [] without raising.

Flow:
  1. For each grid point, resolve lat/lon → AccuWeather locationKey
     (cached in memory to minimise API calls).
  2. Fetch current conditions for that locationKey.
  3. Map to RawWeatherObservation.

Rate-limit guard: only the first 10 points from GLOBAL_GRID are queried
to stay within AccuWeather's free-tier daily call limit.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx

from config import settings
from models.weather import RawWeatherObservation
from services.weather_fetcher import GLOBAL_GRID

logger = logging.getLogger(__name__)

MAX_POINTS = 10

LOCATIONS_URL = "https://dataservice.accuweather.com/locations/v1/cities/geoposition/search"
CONDITIONS_URL = "https://dataservice.accuweather.com/currentconditions/v1/{key}"

# WeatherIcon codes that indicate thunderstorm / lightning
THUNDER_ICONS = {15, 16, 17, 41, 42}


class AccuWeatherFetcher:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self._location_cache: Dict[Tuple[float, float], str] = {}

    async def _resolve_location(
        self, client: httpx.AsyncClient, lat: float, lon: float
    ) -> Optional[str]:
        key = (lat, lon)
        if key in self._location_cache:
            return self._location_cache[key]
        try:
            r = await client.get(
                LOCATIONS_URL,
                params={"apikey": self.api_key, "q": f"{lat},{lon}"},
                timeout=10,
            )
            r.raise_for_status()
            data = r.json()
            location_key = data.get("Key")
            if location_key:
                self._location_cache[key] = location_key
            return location_key
        except Exception as e:
            logger.debug("AccuWeather location lookup failed (%s,%s): %s", lat, lon, e)
            return None

    async def _fetch_point(
        self, client: httpx.AsyncClient, lat: float, lon: float
    ) -> Optional[RawWeatherObservation]:
        try:
            location_key = await self._resolve_location(client, lat, lon)
            if not location_key:
                return None

            url = CONDITIONS_URL.format(key=location_key)
            r = await client.get(
                url,
                params={"apikey": self.api_key, "details": "true"},
                timeout=10,
            )
            r.raise_for_status()
            items = r.json()
            if not items:
                return None
            d = items[0]

            icon = d.get("WeatherIcon", 0)
            text = (d.get("WeatherText") or "").lower()
            has_precip = d.get("HasPrecipitation", False)
            is_thunder = icon in THUNDER_ICONS or (has_precip and "thunder" in text)

            def metric(path: list, key="Value"):
                node = d
                for p in path:
                    if not isinstance(node, dict):
                        return None
                    node = node.get(p)
                return node.get(key) if isinstance(node, dict) else node

            wind_kmh = metric(["Wind", "Speed", "Metric"]) or 0
            wind_dir = metric(["Wind", "Direction", "Degrees"])
            pressure = metric(["Pressure", "Metric"])
            rain_mm = metric(["Precip1hr", "Metric"])
            cloud = d.get("CloudCover")
            humidity = d.get("RelativeHumidity")

            return RawWeatherObservation(
                source="accuweather",
                station_id=f"ACW_{location_key}",
                lat=lat,
                lon=lon,
                timestamp=datetime.now(timezone.utc),
                wind_speed_ms=wind_kmh / 3.6 if wind_kmh else None,
                wind_direction_deg=wind_dir,
                pressure_hpa=pressure,
                rain_1h_mm=rain_mm,
                cloud_cover_pct=cloud,
                humidity_pct=humidity,
                weather_main="Thunderstorm" if is_thunder else d.get("WeatherText"),
            )
        except Exception as e:
            logger.debug("AccuWeather fetch error (%s,%s): %s", lat, lon, e)
            return None

    async def fetch_all(self) -> List[RawWeatherObservation]:
        if not self.api_key:
            return []
        grid_sample = GLOBAL_GRID[:MAX_POINTS]
        async with httpx.AsyncClient() as client:
            tasks = [self._fetch_point(client, lat, lon) for lat, lon in grid_sample]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, RawWeatherObservation)]
