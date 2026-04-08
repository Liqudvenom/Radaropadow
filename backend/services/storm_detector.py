"""
Storm detection and classification engine.

Algorithm:
  1. Filter observations by storm-candidate threshold
  2. Cluster nearby candidates (simple distance-based merge)
  3. Classify each cluster as FORMING / ACTIVE / SEVERE / DISSIPATING
     based on wind speed, pressure, and trend vs previous snapshot
  4. Optionally predict short-term trajectory via linear regression
"""
import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np

from config import settings
from models.storm import Coordinates, StormRecord, StormStatus, StormZone, WindPoint
from models.weather import RawWeatherObservation

logger = logging.getLogger(__name__)

# Merge radius for clustering nearby storm cells (km)
CLUSTER_RADIUS_KM = 400.0

# WMO weather codes that indicate a thunderstorm (used by Open-Meteo)
# 95 = slight/moderate thunderstorm, 96 = with slight hail, 99 = with heavy hail
WMO_THUNDERSTORM_CODES: frozenset[int] = frozenset({95, 96, 99})


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _region_name(lat: float, lon: float) -> str:
    regions = [
        ((0, 40), (-100, -20), "Atlantic Ocean"),
        ((0, 40), (100, 180), "Western Pacific"),
        ((0, 30), (40, 100), "Indian Ocean"),
        ((-40, 0), (20, 130), "Southern Indian Ocean"),
        ((-40, 0), (-80, -20), "South Atlantic"),
        ((-50, -10), (100, 180), "Coral Sea / Australia"),
        ((30, 70), (-30, 60), "Europe / Mediterranean"),
        ((20, 70), (-130, -60), "North America"),
        ((-40, 0), (-100, -30), "Central / South America"),
        ((-50, -10), (-180, 100), "Southern Ocean"),
    ]
    for (lat_lo, lat_hi), (lon_lo, lon_hi), name in regions:
        if lat_lo <= lat <= lat_hi and lon_lo <= lon <= lon_hi:
            return name
    return "Open Ocean"


def _wind_to_uv(speed_ms: float, direction_deg: float) -> Tuple[float, float]:
    """Convert meteorological wind to u (east) / v (north) components."""
    rad = math.radians(direction_deg)
    u = -speed_ms * math.sin(rad)
    v = -speed_ms * math.cos(rad)
    return u, v


class StormDetector:
    def __init__(self):
        # Cache previous storm records for trend detection
        self._prev_storms: Dict[str, StormRecord] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(
        self, observations: List[RawWeatherObservation]
    ) -> Tuple[List[StormRecord], List[WindPoint], List[StormZone]]:
        candidates = [o for o in observations if o.is_storm_candidate()]
        clusters = self._cluster(candidates)

        storms: List[StormRecord] = []
        for cluster in clusters:
            storm = self._classify_cluster(cluster)
            if storm:
                storms.append(storm)

        # Add ML-predicted paths for ACTIVE / SEVERE storms
        for storm in storms:
            if storm.status in (StormStatus.ACTIVE, StormStatus.SEVERE):
                storm.predicted_path = self._predict_path(storm)

        zones = self._build_zones(storms)
        wind_points = self._build_wind_points(observations)

        # Update previous-storm cache for trend detection next cycle
        self._prev_storms = {s.id: s for s in storms}

        return storms, wind_points, zones

    # ------------------------------------------------------------------
    # Clustering
    # ------------------------------------------------------------------

    def _cluster(
        self, candidates: List[RawWeatherObservation]
    ) -> List[List[RawWeatherObservation]]:
        used = [False] * len(candidates)
        clusters: List[List[RawWeatherObservation]] = []

        for i, obs in enumerate(candidates):
            if used[i]:
                continue
            cluster = [obs]
            used[i] = True
            for j, other in enumerate(candidates):
                if used[j]:
                    continue
                if _haversine_km(obs.lat, obs.lon, other.lat, other.lon) <= CLUSTER_RADIUS_KM:
                    cluster.append(other)
                    used[j] = True
            clusters.append(cluster)

        return clusters

    # ------------------------------------------------------------------
    # Classification
    # ------------------------------------------------------------------

    def _classify_cluster(
        self, cluster: List[RawWeatherObservation]
    ) -> Optional[StormRecord]:
        # Aggregate cluster metrics
        wind_speeds = [o.wind_speed_kmh() for o in cluster]
        pressures = [o.pressure_hpa for o in cluster if o.pressure_hpa]
        lats = [o.lat for o in cluster]
        lons = [o.lon for o in cluster]

        avg_wind = float(np.mean(wind_speeds))
        max_wind = float(np.max(wind_speeds))
        avg_pressure = float(np.mean(pressures)) if pressures else 1013.0
        center_lat = float(np.mean(lats))
        center_lon = float(np.mean(lons))

        thunderstorm_count = sum(
            1 for o in cluster
            if (o.weather_main or "").lower() == "thunderstorm"
            or (o.weather_code is not None and o.weather_code in WMO_THUNDERSTORM_CODES)
        )
        avg_direction = float(
            np.mean([o.wind_direction_deg for o in cluster if o.wind_direction_deg is not None])
        ) if any(o.wind_direction_deg is not None for o in cluster) else 0.0

        # Need at least moderate storm indicators
        if avg_wind < 40 and avg_pressure > 1005 and thunderstorm_count == 0:
            return None

        # Classify by wind + pressure
        if max_wind >= settings.wind_severe_kmh or avg_pressure < settings.pressure_active_hpa:
            status = StormStatus.SEVERE
        elif avg_wind >= settings.wind_active_kmh or avg_pressure < settings.pressure_forming_hpa:
            status = StormStatus.ACTIVE
        elif avg_wind >= settings.wind_forming_kmh or thunderstorm_count > 0:
            status = StormStatus.FORMING
        else:
            status = StormStatus.FORMING

        # Check for dissipation trend vs previous cycle
        prev = self._find_nearby_previous(center_lat, center_lon)
        if prev and avg_wind < prev.wind_speed_kmh * 0.75:
            status = StormStatus.DISSIPATING

        # Intensity: 0–1 normalized
        intensity = max(0.0, min(1.0, (max_wind - 40) / 100.0))

        storm_id = (
            prev.id
            if prev
            else f"storm_{uuid.uuid4().hex[:8]}"
        )

        return StormRecord(
            id=storm_id,
            status=status,
            coordinates=Coordinates(lat=center_lat, lon=center_lon),
            wind_speed_kmh=round(avg_wind, 1),
            wind_direction_deg=round(avg_direction, 1),
            pressure_hpa=round(avg_pressure, 1),
            intensity=round(intensity, 3),
            region=_region_name(center_lat, center_lon),
            timestamp=datetime.now(timezone.utc),
            description=self._describe(status, avg_wind, avg_pressure),
        )

    def _describe(self, status: StormStatus, wind: float, pressure: float) -> str:
        parts = {
            StormStatus.FORMING: f"Developing system, wind {wind:.0f} km/h, P={pressure:.0f} hPa",
            StormStatus.ACTIVE: f"Active storm, sustained winds {wind:.0f} km/h, P={pressure:.0f} hPa",
            StormStatus.SEVERE: f"SEVERE storm – winds {wind:.0f} km/h, extremely low P={pressure:.0f} hPa",
            StormStatus.DISSIPATING: f"Weakening system, wind {wind:.0f} km/h, P={pressure:.0f} hPa",
        }
        return parts.get(status, "")

    def _find_nearby_previous(
        self, lat: float, lon: float, radius_km: float = 500.0
    ) -> Optional[StormRecord]:
        for prev in self._prev_storms.values():
            if _haversine_km(lat, lon, prev.coordinates.lat, prev.coordinates.lon) <= radius_km:
                return prev
        return None

    # ------------------------------------------------------------------
    # Trajectory prediction (linear extrapolation with smoothing)
    # ------------------------------------------------------------------

    def _predict_path(
        self, storm: StormRecord, steps: int = 6, step_hours: float = 3.0
    ) -> List[Coordinates]:
        """
        Predict future positions using storm's bearing derived from wind direction.
        Simple advection model: storm moves in the direction of its mean wind.
        """
        R = 6371.0
        speed_kms = storm.wind_speed_kmh  # km/h as proxy for storm movement speed / 10
        move_speed_kmh = speed_kms * 0.12   # storms typically move ~10-15% of wind speed

        bearing_rad = math.radians(storm.wind_direction_deg)
        path = []
        lat = storm.coordinates.lat
        lon = storm.coordinates.lon

        for step in range(1, steps + 1):
            dist_km = move_speed_kmh * step_hours * step
            dlat = (dist_km / R) * math.degrees(1) * math.cos(bearing_rad)
            dlon = (dist_km / R) * math.degrees(1) * math.sin(bearing_rad) / math.cos(math.radians(lat))
            lat = max(-85.0, min(85.0, lat + dlat))
            lon = ((lon + dlon + 180) % 360) - 180
            path.append(Coordinates(lat=round(lat, 3), lon=round(lon, 3)))

        return path

    # ------------------------------------------------------------------
    # Storm zones (aggregate nearby storms into risk zones)
    # ------------------------------------------------------------------

    def _build_zones(self, storms: List[StormRecord]) -> List[StormZone]:
        zones: List[StormZone] = []
        used = set()
        for storm in storms:
            if storm.id in used:
                continue
            zone_storms = [storm]
            used.add(storm.id)
            for other in storms:
                if other.id in used:
                    continue
                if _haversine_km(
                    storm.coordinates.lat, storm.coordinates.lon,
                    other.coordinates.lat, other.coordinates.lon,
                ) < 800:
                    zone_storms.append(other)
                    used.add(other.id)

            lats = [s.coordinates.lat for s in zone_storms]
            lons = [s.coordinates.lon for s in zone_storms]
            max_intensity = max(s.intensity for s in zone_storms)
            dominant_status = max(zone_storms, key=lambda s: s.intensity).status
            zones.append(
                StormZone(
                    id=f"zone_{uuid.uuid4().hex[:6]}",
                    status=dominant_status,
                    center=Coordinates(lat=float(np.mean(lats)), lon=float(np.mean(lons))),
                    radius_km=max(300.0, len(zone_storms) * 200.0),
                    intensity=round(max_intensity, 3),
                    storms=[s.id for s in zone_storms],
                )
            )
        return zones

    # ------------------------------------------------------------------
    # Wind grid
    # ------------------------------------------------------------------

    def _build_wind_points(
        self, observations: List[RawWeatherObservation]
    ) -> List[WindPoint]:
        points: List[WindPoint] = []
        for obs in observations:
            if obs.wind_speed_ms is None or obs.wind_direction_deg is None:
                continue
            u, v = _wind_to_uv(obs.wind_speed_ms, obs.wind_direction_deg)
            points.append(
                WindPoint(
                    lat=obs.lat,
                    lon=obs.lon,
                    speed_kmh=round(obs.wind_speed_kmh(), 1),
                    direction_deg=round(obs.wind_direction_deg, 1),
                    u_component=round(u, 3),
                    v_component=round(v, 3),
                )
            )
        return points
