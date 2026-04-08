from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # API keys
    openweathermap_api_key: Optional[str] = None
    noaa_token: Optional[str] = None
    accuweather_api_key: str = ""
    aqicn_token: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"

    # App
    app_env: str = "development"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Data refresh interval in seconds
    data_refresh_interval: int = 300  # 5 minutes

    # Storm detection thresholds
    wind_forming_kmh: float = 60.0
    wind_active_kmh: float = 90.0
    wind_severe_kmh: float = 120.0
    pressure_forming_hpa: float = 995.0
    pressure_active_hpa: float = 980.0
    pressure_drop_threshold_hpa: float = 5.0   # drop per 3h

    # History retention in seconds (24 hours)
    history_ttl: int = 86400

    # Free weather data sources (no API key required)
    open_meteo_enabled: bool = True
    seven_timer_enabled: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
