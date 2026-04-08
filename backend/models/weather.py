from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RawWeatherObservation(BaseModel):
    """Normalized observation from any weather source."""
    source: str                          # "openweathermap" | "noaa" | "mock"
    station_id: str
    lat: float
    lon: float
    timestamp: datetime

    # Atmospheric
    temperature_c: Optional[float] = None
    pressure_hpa: Optional[float] = None
    humidity_pct: Optional[float] = None
    cloud_cover_pct: Optional[float] = None

    # Wind
    wind_speed_ms: Optional[float] = None   # m/s - normalized to km/h downstream
    wind_direction_deg: Optional[float] = None
    wind_gust_ms: Optional[float] = None

    # Precipitation / storm indicators
    rain_1h_mm: Optional[float] = None
    rain_3h_mm: Optional[float] = None
    weather_code: Optional[int] = None      # OWM condition code
    weather_main: Optional[str] = None      # "Thunderstorm", "Rain", etc.
    visibility_m: Optional[float] = None

    def wind_speed_kmh(self) -> float:
        if self.wind_speed_ms is None:
            return 0.0
        return self.wind_speed_ms * 3.6

    def is_storm_candidate(self) -> bool:
        """Quick pre-filter before full detection logic."""
        wind_ok = (self.wind_speed_ms or 0) * 3.6 >= 40
        # OWM weather_main string OR WMO thunderstorm codes 95/96/99 (Open-Meteo)
        thunderstorm = (
            (self.weather_main or "").lower() == "thunderstorm"
            or self.weather_code in {95, 96, 99}
        )
        pressure_ok = (self.pressure_hpa or 1013) < 1000
        return wind_ok or thunderstorm or pressure_ok
