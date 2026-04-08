"""
WebSocket manager.

Clients connect to /ws and receive JSON push messages whenever a new
weather snapshot is ingested. The message envelope:

  {
    "type": "snapshot",
    "payload": <WeatherSnapshot>,
    "ts": "<iso8601>"
  }

or an alert for severe storms:

  {
    "type": "alert",
    "severity": "SEVERE",
    "storm_id": "...",
    "region": "...",
    "wind_kmh": 145.0,
    "ts": "..."
  }
"""
import json
import logging
from datetime import datetime, timezone
from typing import Set

from fastapi import WebSocket, WebSocketDisconnect

from models.storm import StormStatus, WeatherSnapshot

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.add(ws)
        logger.info("WS client connected. Total: %d", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)
        logger.info("WS client disconnected. Total: %d", len(self._active))

    async def broadcast(self, message: dict) -> None:
        dead: Set[WebSocket] = set()
        for ws in list(self._active):
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._active.discard(ws)

    async def broadcast_snapshot(self, snapshot: WeatherSnapshot) -> None:
        payload = snapshot.model_dump(mode="json")
        await self.broadcast({
            "type": "snapshot",
            "payload": payload,
            "ts": datetime.now(timezone.utc).isoformat(),
        })

        # Emit alert messages for severe storms
        for storm in snapshot.storms:
            if storm.status == StormStatus.SEVERE:
                await self.broadcast({
                    "type": "alert",
                    "severity": "SEVERE",
                    "storm_id": storm.id,
                    "region": storm.region,
                    "wind_kmh": storm.wind_speed_kmh,
                    "pressure_hpa": storm.pressure_hpa,
                    "ts": datetime.now(timezone.utc).isoformat(),
                })

    @property
    def connection_count(self) -> int:
        return len(self._active)


manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep alive – echo pings from client
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning("WS error: %s", e)
        manager.disconnect(websocket)
