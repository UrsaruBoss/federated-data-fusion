# app/routes/events.py
# ------------------------------------------------------------
# Events API
#
# Events are stored as:
# - K_EVENTS: list of recent event_ids (tail is newest)
# - event:<id>: JSON payload
# ------------------------------------------------------------

from fastapi import APIRouter, Query
from ..redis_client import get_redis
from ..generators import K_EVENTS
from ._common import fetch_items_by_ids

router = APIRouter(tags=["events"])


@router.get("/api/events")
def list_events(limit: int = Query(50, ge=1, le=300)):
    """
    List recent events (newest first).

    We store events in a Redis list where newest is at the end.
    We return a reversed slice so UI sees newest at top.
    """
    r = get_redis()

    total = r.llen(K_EVENTS)
    if total <= 0:
        return {"items": []}

    # Pull last `limit` ids
    ids = r.lrange(K_EVENTS, -limit, -1)

    # Reverse so newest is first
    ids = list(reversed(ids))

    out = fetch_items_by_ids(r, ids, key_prefix="event")
    return {"items": out}
