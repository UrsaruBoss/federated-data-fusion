# app/routes/stream.py
# ------------------------------------------------------------
# Server-Sent Events (SSE) stream
#
# The generator writes updates into Redis list K_UPDATES.
# This endpoint replays new items to connected clients:
# - event: <type>
# - data: <json>
#
# Why Redis list?
# - simple fan-out
# - easy trimming
# - demo-friendly
# ------------------------------------------------------------

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio
import json
import time
from typing import AsyncGenerator

from ..redis_client import get_redis
from ..generators import K_UPDATES

router = APIRouter(tags=["stream"])


def sse(event: str, data_obj) -> str:
    """
    Build an SSE message.

    Format:
        event: name
        data: json
    """
    return f"event: {event}\ndata: {json.dumps(data_obj)}\n\n"


@router.get("/api/stream")
def stream():
    """
    Live updates stream.

    Implementation notes:
    - Starts from "now" (does not replay history) to avoid huge bursts.
    - Sends a heartbeat periodically to keep connection alive.
    - Uses async sleep (does NOT block the server worker).
    """
    r = get_redis()
    last_idx = r.llen(K_UPDATES)  # start from "now"

    async def gen() -> AsyncGenerator[str, None]:
        nonlocal last_idx

        # initial hello + retry hint (client reconnect delay)
        yield "retry: 2000\n\n"
        yield sse("hello", {"ok": True, "ts": time.time()})

        heartbeat_every = 10  # seconds
        poll_every = 0.5      # seconds (light polling)

        last_heartbeat = time.time()

        while True:
            length = r.llen(K_UPDATES)

            if length > last_idx:
                items = r.lrange(K_UPDATES, last_idx, length - 1)
                last_idx = length

                for raw in items:
                    payload = json.loads(raw)
                    evt_type = payload.get("type", "update")
                    data = payload.get("data", {})
                    yield sse(evt_type, data)

            # heartbeat
            now = time.time()
            if now - last_heartbeat >= heartbeat_every:
                yield sse("heartbeat", {"t": now})
                last_heartbeat = now

            await asyncio.sleep(poll_every)

    headers = {
        # SSE must not be cached
        "Cache-Control": "no-cache",
        # keep TCP connection open
        "Connection": "keep-alive",
        # if behind nginx, prevents response buffering
        "X-Accel-Buffering": "no",
    }

    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)
