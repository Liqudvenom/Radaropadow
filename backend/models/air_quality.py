from pydantic import BaseModel
from typing import Optional
from datetime import datetime


def _aqi_category(aqi: int) -> str:
    if aqi <= 50:   return "Good"
    if aqi <= 100:  return "Moderate"
    if aqi <= 150:  return "Unhealthy for Sensitive Groups"
    if aqi <= 200:  return "Unhealthy"
    if aqi <= 300:  return "Very Unhealthy"
    return "Hazardous"


class AirQualityPoint(BaseModel):
    lat: float
    lon: float
    aqi: int                    # 0-500
    pm25: Optional[float] = None
    no2: Optional[float] = None
    station_name: str
    timestamp: datetime
    category: str               # derived from aqi

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
