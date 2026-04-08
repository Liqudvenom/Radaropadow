"""
RainViewer tile metadata fetcher.

No API key required. Fetches the latest radar timestamps from
RainViewer's public weather-maps endpoint and returns only the
metadata the frontend needs to render its own tile layers.

The frontend uses the tile URL template:
  https://tilecache.rainviewer.com{path}/{size}/{z}/{x}/{y}/2/1_1.png
"""
import logging
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

WEATHER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json"
TILE_HOST = "https://tilecache.rainviewer.com"


class RainViewerFetcher:
    async def fetch(self) -> Optional[Dict]:
        """
        Returns a dict:
          {
            "rainviewer_host": str,
            "latest_path": str,       # e.g. "/v2/radar/1234567890"
            "timestamps": [int, ...]   # last 12 past radar timestamps
          }
        Returns None on error.
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(WEATHER_MAPS_URL)
                r.raise_for_status()
                data = r.json()

            past = data.get("radar", {}).get("past", [])
            if not past:
                logger.warning("RainViewer: no past radar entries found")
                return None

            # Newest entry is last in list
            latest = past[-1]
            latest_path = latest.get("path", "")
            timestamps = [entry.get("time") for entry in past[-12:] if entry.get("time")]

            result = {
                "rainviewer_host": TILE_HOST,
                "latest_path": latest_path,
                "timestamps": timestamps,
            }
            logger.info("RainViewer: fetched %d timestamps, latest=%s", len(timestamps), latest_path)
            return result

        except Exception as e:
            logger.warning("RainViewer fetch failed: %s", e)
            return None
