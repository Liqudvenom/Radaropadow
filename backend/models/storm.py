from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime

from models.air_quality import AirQualityPoint


class StormStatus(str, Enum):
    FORMING = "FORMING"
    ACTIVE = "ACTIVE"
    SEVERE = "SEVERE"
    DISSIPATING = "DISSIPATING"


class Coordinates(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class StormRecord(BaseModel):
    id: str
    status: StormStatus
    coordinates: Coordinates
    wind_speed_kmh: float
    wind_direction_deg: float
    pressure_hpa: float
    intensity: float = Field(..., ge=0, le=1, description="Normalized 0-1 intensity")
    region: str
    timestamp: datetime
    predicted_path: Optional[List[Coordinates]] = None
    description: str = ""

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class WindPoint(BaseModel):
    lat: float
    lon: float
    speed_kmh: float
    direction_deg: float
    u_component: float   # East-West component m/s
    v_component: float   # North-South component m/s


class StormZone(BaseModel):
    id: str
    status: StormStatus
    center: Coordinates
    radius_km: float
    intensity: float
    storms: List[str]  # Storm IDs in this zone


class WeatherSnapshot(BaseModel):
    timestamp: datetime
    storms: List[StormRecord]
    wind_points: List[WindPoint]
    storm_zones: List[StormZone]
    active_count: int
    severe_count: int
    air_quality: List[AirQualityPoint] = []

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
