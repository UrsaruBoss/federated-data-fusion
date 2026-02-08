# app/main.py
# ------------------------------------------------------------
# FastAPI entrypoint for the Data Fusion Dashboard backend.
#
# Responsibilities:
# - App initialization & middleware
# - Route registration
# - Startup bootstrapping
# - Background simulation loops (events, assets, alerts)
# ------------------------------------------------------------

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from .config import settings
from .generators import (
    bootstrap_assets,
    generate_event,
    update_assets,
    generate_alert,
)

from .routes import events, assets, alerts, stream, health, admin

from .redis_client import get_redis


# ------------------------------------------------------------
# FastAPI application instance
# ------------------------------------------------------------
app = FastAPI(
    title="Data Fusion Dashboard API",
    version="0.1.0",
    description="Synthetic backend for situational awareness demos",
)


# ------------------------------------------------------------
# CORS configuration
# Allows frontend dashboards to connect safely
# ------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    print("🔥 Unhandled exception on", request.method, request.url)
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": str(exc), "path": str(request.url)},
    )


# ------------------------------------------------------------
# API routes
# ------------------------------------------------------------
app.include_router(events.router)
app.include_router(assets.router)
app.include_router(alerts.router)
app.include_router(stream.router)   
app.include_router(health.router)
app.include_router(admin.router)


# ------------------------------------------------------------
# Application startup hook
# ------------------------------------------------------------
@app.on_event("startup")
async def startup():
    """
    On startup:
    1. Bootstrap initial assets (only once).
    2. Start background simulation loops if enabled.
    """

    # Ensure assets exist before any events/alerts reference them
    bootstrap_assets()

    if not settings.generators_enabled:
        # Useful for production / static demo mode
        return

    # --------------------------------------------------------
    # Background simulation loops
    # Each loop runs independently at configurable intervals
    # --------------------------------------------------------

    r = get_redis()

    def _get_rate(redis_key: str, default: int) -> int:
        """
        Read dynamic loop rate from Redis.
        Falls back to default if missing/invalid.
        """
        v = r.get(redis_key)
        try:
            return max(1, int(v)) if v is not None else default
        except Exception:
            return default

    async def loop_events():
        while True:
            generate_event()
            await asyncio.sleep(_get_rate("sim:rate:event_sec", settings.event_rate_sec))

    async def loop_assets():
        while True:
            update_assets()
            await asyncio.sleep(_get_rate("sim:rate:asset_sec", settings.asset_rate_sec))

    async def loop_alerts():
        while True:
            generate_alert()
            await asyncio.sleep(_get_rate("sim:rate:alert_sec", settings.alert_rate_sec))

    # Fire-and-forget background tasks
    asyncio.create_task(loop_events())
    asyncio.create_task(loop_assets())
    asyncio.create_task(loop_alerts())
