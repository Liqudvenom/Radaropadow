"""
Weather data ingestion layer.

Priority order:
  1. Open-Meteo  (free, no key, global coverage – highest quality)
  2. OpenWeatherMap (requires OPENWEATHERMAP_API_KEY)
  3. AccuWeather (requires ACCUWEATHER_API_KEY, max 10 points)
  4. NOAA weather.gov API (free, US-focused)
  5. 7Timer!  (free, no key, 10 sample points)
  6. Mock generator (always available as fallback)

All sources normalize to RawWeatherObservation before returning.
"""
import asyncio
import hashlib
import logging
import math
import random
from datetime import datetime, timezone
from typing import List, Optional

import httpx

from config import settings
from models.weather import RawWeatherObservation

logger = logging.getLogger(__name__)

# A global grid of lat/lon points covering major storm-prone regions worldwide
GLOBAL_GRID: List[tuple[float, float]] = [
    # Atlantic / Americas
    (25.0, -80.0), (20.0, -75.0), (15.0, -65.0), (10.0, -60.0),
    (30.0, -90.0), (35.0, -85.0), (40.0, -75.0), (45.0, -70.0),
    # Pacific typhoon belt
    (15.0, 135.0), (20.0, 130.0), (25.0, 125.0), (10.0, 140.0),
    (5.0, 145.0), (20.0, 115.0), (25.0, 140.0),
    # Indian Ocean / Bay of Bengal
    (15.0, 85.0), (10.0, 80.0), (20.0, 90.0), (-15.0, 55.0),
    (-20.0, 60.0), (5.0, 75.0),
    # Australia
    (-20.0, 120.0), (-15.0, 130.0), (-25.0, 115.0), (-20.0, 150.0),
    # Europe / Mediterranean
    (45.0, 10.0), (40.0, 15.0), (50.0, 0.0), (55.0, 5.0),
    (52.0, 20.0), (48.0, 25.0),
    # Africa
    (5.0, 10.0), (10.0, 20.0), (-5.0, 30.0), (0.0, 40.0),
    # Central / South America
    (-5.0, -45.0), (-15.0, -55.0), (-25.0, -50.0), (5.0, -70.0),
    # Extra Atlantic
    (50.0, -30.0), (55.0, -20.0), (45.0, -40.0), (60.0, -10.0),
]


# ---------------------------------------------------------------------------
# OpenWeatherMap source
# ---------------------------------------------------------------------------

class OpenWeatherMapFetcher:
    BASE = "https://api.openweathermap.org/data/2.5/weather"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def fetch_point(
        self, client: httpx.AsyncClient, lat: float, lon: float
    ) -> Optional[RawWeatherObservation]:
        try:
            r = await client.get(
                self.BASE,
                params={"lat": lat, "lon": lon, "appid": self.api_key, "units": "metric"},
                timeout=10,
            )
            r.raise_for_status()
            d = r.json()
            wind = d.get("wind", {})
            main = d.get("main", {})
            clouds = d.get("clouds", {})
            weather = d.get("weather", [{}])[0]
            rain = d.get("rain", {})
            return RawWeatherObservation(
                source="openweathermap",
                station_id=str(d.get("id", f"{lat},{lon}")),
                lat=lat,
                lon=lon,
                timestamp=datetime.fromtimestamp(d.get("dt", 0), tz=timezone.utc),
                temperature_c=main.get("temp"),
                pressure_hpa=main.get("pressure"),
                humidity_pct=main.get("humidity"),
                cloud_cover_pct=clouds.get("all"),
                wind_speed_ms=wind.get("speed"),
                wind_direction_deg=wind.get("deg"),
                wind_gust_ms=wind.get("gust"),
                rain_1h_mm=rain.get("1h"),
                rain_3h_mm=rain.get("3h"),
                weather_code=weather.get("id"),
                weather_main=weather.get("main"),
            )
        except Exception as e:
            logger.debug("OWM fetch error at (%s,%s): %s", lat, lon, e)
            return None

    async def fetch_all(self) -> List[RawWeatherObservation]:
        async with httpx.AsyncClient() as client:
            tasks = [self.fetch_point(client, lat, lon) for lat, lon in GLOBAL_GRID]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, RawWeatherObservation)]


# ---------------------------------------------------------------------------
# NOAA weather.gov source (US points only, free)
# ---------------------------------------------------------------------------

class NOAAFetcher:
    POINTS_URL = "https://api.weather.gov/points/{lat},{lon}"
    OBSERVATIONS_URL = "https://api.weather.gov/stations/{station}/observations/latest"

    # A handful of NOAA observation stations
    STATIONS = [
        "KORD", "KLAX", "KJFK", "KIAH", "KMIA",
        "KSEA", "KDEN", "KATL", "KDFW", "KBOS",
    ]

    async def fetch_station(
        self, client: httpx.AsyncClient, station: str
    ) -> Optional[RawWeatherObservation]:
        try:
            url = self.OBSERVATIONS_URL.format(station=station)
            r = await client.get(url, timeout=10, headers={"User-Agent": "StormTracker/1.0"})
            r.raise_for_status()
            props = r.json().get("properties", {})
            geo = r.json().get("geometry", {}).get("coordinates", [0, 0])
            lon, lat = geo[0], geo[1]

            def val(d):
                return d.get("value") if isinstance(d, dict) else d

            return RawWeatherObservation(
                source="noaa",
                station_id=station,
                lat=lat,
                lon=lon,
                timestamp=datetime.fromisoformat(
                    props.get("timestamp", datetime.now(timezone.utc).isoformat())
                ),
                temperature_c=val(props.get("temperature")),
                pressure_hpa=(
                    (val(props.get("seaLevelPressure")) or 0) / 100 or None
                ),
                humidity_pct=val(props.get("relativeHumidity")),
                wind_speed_ms=val(props.get("windSpeed")),
                wind_direction_deg=val(props.get("windDirection")),
                wind_gust_ms=val(props.get("windGust")),
                weather_main=props.get("textDescription"),
            )
        except Exception as e:
            logger.debug("NOAA fetch error for %s: %s", station, e)
            return None

    async def fetch_all(self) -> List[RawWeatherObservation]:
        async with httpx.AsyncClient() as client:
            tasks = [self.fetch_station(client, s) for s in self.STATIONS]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, RawWeatherObservation)]


# ---------------------------------------------------------------------------
# Open-Meteo source (free, no key required, global coverage)
# ---------------------------------------------------------------------------

class OpenMeteoFetcher:
    """
    Fetches current weather from the Open-Meteo API for every point in
    GLOBAL_GRID.  No API key needed.  Concurrency capped at 10 via Semaphore
    to avoid overwhelming the endpoint.
    """

    BASE = "https://api.open-meteo.com/v1/forecast"
    CONCURRENCY = 10

    async def _fetch_point(
        self,
        client: httpx.AsyncClient,
        sem: asyncio.Semaphore,
        lat: float,
        lon: float,
    ) -> Optional[RawWeatherObservation]:
        try:
            async with sem:
                r = await client.get(
                    self.BASE,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "current": (
                            "wind_speed_10m,wind_direction_10m,wind_gusts_10m,"
                            "surface_pressure,precipitation,cloud_cover,"
                            "weather_code,temperature_2m,relative_humidity_2m"
                        ),
                        "wind_speed_unit": "kmh",
                        "timezone": "UTC",
                    },
                    timeout=15,
                )
            r.raise_for_status()
            d = r.json()
            cur = d.get("current", {})

            # API returns speeds in km/h (wind_speed_unit=kmh) → convert to m/s
            wind_kmh = cur.get("wind_speed_10m")
            gust_kmh = cur.get("wind_gusts_10m")

            return RawWeatherObservation(
                source="open-meteo",
                station_id=f"om_{lat:.2f}_{lon:.2f}",
                lat=lat,
                lon=lon,
                timestamp=datetime.now(timezone.utc),
                temperature_c=cur.get("temperature_2m"),
                pressure_hpa=cur.get("surface_pressure"),
                humidity_pct=cur.get("relative_humidity_2m"),
                cloud_cover_pct=cur.get("cloud_cover"),
                wind_speed_ms=wind_kmh / 3.6 if wind_kmh is not None else None,
                wind_direction_deg=cur.get("wind_direction_10m"),
                wind_gust_ms=gust_kmh / 3.6 if gust_kmh is not None else None,
                rain_1h_mm=cur.get("precipitation"),
                weather_code=cur.get("weather_code"),  # WMO code
            )
        except Exception as e:
            logger.debug("Open-Meteo fetch error at (%.2f, %.2f): %s", lat, lon, e)
            return None

    async def fetch_all(self) -> List[RawWeatherObservation]:
        sem = asyncio.Semaphore(self.CONCURRENCY)
        async with httpx.AsyncClient() as client:
            tasks = [
                self._fetch_point(client, sem, lat, lon)
                for lat, lon in GLOBAL_GRID
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, RawWeatherObservation)]


# ---------------------------------------------------------------------------
# 7Timer! source (free, no key, 10 sample points)
# ---------------------------------------------------------------------------

# Beaufort scale → approximate m/s midpoints
_BEAUFORT_MS = [0.3, 1.5, 3.3, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8]

# Cardinal / intercardinal direction string → degrees
_DIR_DEG: dict[str, float] = {
    "N": 0.0, "NNE": 22.5, "NE": 45.0, "ENE": 67.5,
    "E": 90.0, "ESE": 112.5, "SE": 135.0, "SSE": 157.5,
    "S": 180.0, "SSW": 202.5, "SW": 225.0, "WSW": 247.5,
    "W": 270.0, "WNW": 292.5, "NW": 315.0, "NNW": 337.5,
}


class SevenTimerFetcher:
    """
    Fetches civil weather forecasts from the 7Timer! API for the first 10
    points in GLOBAL_GRID.  No API key needed.
    """

    BASE = "https://www.7timer.info/bin/api.pl"
    POINTS = GLOBAL_GRID[:10]

    async def _fetch_point(
        self,
        client: httpx.AsyncClient,
        lat: float,
        lon: float,
    ) -> Optional[RawWeatherObservation]:
        try:
            r = await client.get(
                self.BASE,
                params={"lon": lon, "lat": lat, "product": "civil", "output": "json"},
                timeout=20,
            )
            r.raise_for_status()
            d = r.json()

            dataseries = d.get("dataseries") or []
            if not dataseries:
                return None

            pt = dataseries[0]

            # wind2m: numeric m/s (per spec) or wind10m: {direction, speed (Beaufort)}
            wind_ms: Optional[float] = None
            wind_dir: Optional[float] = None

            wind_raw = pt.get("wind2m")
            if wind_raw is None:
                wind_raw = pt.get("wind10m")

            if isinstance(wind_raw, (int, float)):
                wind_ms = float(wind_raw)
            elif isinstance(wind_raw, dict):
                spd = wind_raw.get("speed")
                if isinstance(spd, (int, float)):
                    idx = max(0, min(int(spd), len(_BEAUFORT_MS) - 1))
                    wind_ms = _BEAUFORT_MS[idx]
                direction_str = str(wind_raw.get("direction", ""))
                wind_dir = _DIR_DEG.get(direction_str.upper())

            # cloudcover is 1–9 enum in the civil product → scale to 0–100 %
            cloudcover_raw = pt.get("cloudcover")
            cloud_pct: Optional[float] = None
            if isinstance(cloudcover_raw, (int, float)) and cloudcover_raw > 0:
                cloud_pct = round((cloudcover_raw / 9.0) * 100.0, 1)

            return RawWeatherObservation(
                source="7timer",
                station_id=f"7t_{lat:.2f}_{lon:.2f}",
                lat=lat,
                lon=lon,
                timestamp=datetime.now(timezone.utc),
                temperature_c=pt.get("temp2m"),
                cloud_cover_pct=cloud_pct,
                wind_speed_ms=wind_ms,
                wind_direction_deg=wind_dir,
            )
        except Exception as e:
            logger.debug("7Timer fetch error at (%.2f, %.2f): %s", lat, lon, e)
            return None

    async def fetch_all(self) -> List[RawWeatherObservation]:
        async with httpx.AsyncClient() as client:
            tasks = [
                self._fetch_point(client, lat, lon)
                for lat, lon in self.POINTS
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, RawWeatherObservation)]


# ---------------------------------------------------------------------------
# Mock data generator – realistic, physics-inspired
# ---------------------------------------------------------------------------

class MockWeatherGenerator:
    """
    Generates plausible, time-varying weather observations.
    Uses sinusoidal noise so storm cells evolve smoothly over time.
    """

    def __init__(self):
        self._cycle = 0

    def _stable_random(self, seed: str, offset: float = 0.0) -> float:
        """Deterministic pseudo-random float [0,1) per seed + time."""
        t = datetime.now(timezone.utc).timestamp() / 3600  # hour-scale
        h = int(hashlib.md5((seed + str(int(t + offset))).encode()).hexdigest(), 16)
        return (h % 10000) / 10000.0

    def _sin_noise(self, seed: str, period_h: float = 6.0) -> float:
        """Smooth sinusoidal variation, period in hours."""
        t = datetime.now(timezone.utc).timestamp() / 3600
        h = int(hashlib.md5(seed.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        return 0.5 + 0.5 * math.sin(2 * math.pi * (t / period_h + h))

    def generate(self) -> List[RawWeatherObservation]:
        obs = []
        for i, (lat, lon) in enumerate(GLOBAL_GRID):
            seed = f"{lat:.1f},{lon:.1f}"
            noise = self._sin_noise(seed, period_h=8)
            is_storm = noise > 0.65  # ~35% of points are stormy at any time

            if is_storm:
                wind_ms = random.uniform(15, 40)
                pressure = random.uniform(960, 995)
                cloud = random.uniform(70, 100)
                weather_main = random.choice(["Thunderstorm", "Squall", "Rain"])
                weather_code = 200 if weather_main == "Thunderstorm" else 501
            else:
                wind_ms = random.uniform(2, 18)
                pressure = random.uniform(1000, 1025)
                cloud = random.uniform(0, 60)
                weather_main = random.choice(["Clear", "Clouds", "Drizzle"])
                weather_code = 800

            direction = random.uniform(0, 360)
            obs.append(
                RawWeatherObservation(
                    source="mock",
                    station_id=f"MOCK_{i:03d}",
                    lat=lat,
                    lon=lon,
                    timestamp=datetime.now(timezone.utc),
                    temperature_c=random.uniform(10, 35),
                    pressure_hpa=pressure,
                    humidity_pct=random.uniform(40, 100) if is_storm else random.uniform(20, 70),
                    cloud_cover_pct=cloud,
                    wind_speed_ms=wind_ms,
                    wind_direction_deg=direction,
                    wind_gust_ms=wind_ms * random.uniform(1.2, 1.8),
                    rain_1h_mm=random.uniform(5, 30) if is_storm else 0,
                    weather_code=weather_code,
                    weather_main=weather_main,
                )
            )
        return obs


# ---------------------------------------------------------------------------
# Aggregated fetcher
# ---------------------------------------------------------------------------

class WeatherFetcher:
    """
    Runs all configured sources concurrently.

    Deduplication priority (highest → lowest):
      Open-Meteo → OWM → AccuWeather → NOAA → 7Timer → Mock

    Mock fills any coordinates not covered by live sources.
    """

    def __init__(self):
        from services.accuweather_fetcher import AccuWeatherFetcher

        self._mock = MockWeatherGenerator()

        # Free sources – always enabled when flags are True
        self._open_meteo = OpenMeteoFetcher() if settings.open_meteo_enabled else None
        self._seven_timer = SevenTimerFetcher() if settings.seven_timer_enabled else None

        # Key-gated sources
        self._owm = (
            OpenWeatherMapFetcher(settings.openweathermap_api_key)
            if settings.openweathermap_api_key
            else None
        )
        self._acw = (
            AccuWeatherFetcher(settings.accuweather_api_key)
            if settings.accuweather_api_key
            else None
        )
        self._noaa = NOAAFetcher()

    async def fetch(self) -> List[RawWeatherObservation]:
        # Build ordered task list: index 0 = highest priority
        ordered_tasks: List[tuple[str, object]] = []

        if self._open_meteo:
            ordered_tasks.append(("open-meteo", self._open_meteo.fetch_all()))
        if self._owm:
            ordered_tasks.append(("owm", self._owm.fetch_all()))
        if self._acw:
            ordered_tasks.append(("acw", self._acw.fetch_all()))
        ordered_tasks.append(("noaa", self._noaa.fetch_all()))
        if self._seven_timer:
            ordered_tasks.append(("7timer", self._seven_timer.fetch_all()))

        labels = [lbl for lbl, _ in ordered_tasks]
        coros = [coro for _, coro in ordered_tasks]

        gathered = await asyncio.gather(*coros, return_exceptions=True)

        # Separate Open-Meteo results to ensure they win deduplication
        priority_obs: List[RawWeatherObservation] = []
        secondary_obs: List[RawWeatherObservation] = []

        for label, batch in zip(labels, gathered):
            if not isinstance(batch, list):
                continue
            if label == "open-meteo":
                priority_obs.extend(batch)
            else:
                secondary_obs.extend(batch)

        # Deduplicate: first occurrence per rounded coordinate wins
        seen: set[tuple[float, float]] = set()
        results: List[RawWeatherObservation] = []

        for obs in priority_obs + secondary_obs:
            key = (round(obs.lat, 2), round(obs.lon, 2))
            if key not in seen:
                results.append(obs)
                seen.add(key)

        # Mock fills any grid points not covered by live sources
        live_coords = {(r.lat, r.lon) for r in results}
        for obs in self._mock.generate():
            if (obs.lat, obs.lon) not in live_coords:
                results.append(obs)

        logger.info(
            "Fetched %d weather observations (%d from open-meteo, %d secondary)",
            len(results),
            len(priority_obs),
            len(secondary_obs),
        )
        return results
