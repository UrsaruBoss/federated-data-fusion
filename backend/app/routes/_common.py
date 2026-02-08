# app/routes/_common.py
# ------------------------------------------------------------
# Shared helpers for Redis-backed list endpoints.
# Keeps route files small and consistent.
# ------------------------------------------------------------

import json
from typing import List, Dict, Any, Optional
import redis


def fetch_items_by_ids(
    r: redis.Redis,
    ids: List[str],
    key_prefix: str,
) -> List[Dict[str, Any]]:
    """
    Given a list of entity IDs, fetch their JSON payloads from Redis.

    Example:
        ids = ["evt_x", "evt_y"]
        key_prefix = "event"
        -> GET event:evt_x, event:evt_y
    """
    out: List[Dict[str, Any]] = []
    for _id in ids:
        raw = r.get(f"{key_prefix}:{_id}")
        if raw:
            out.append(json.loads(raw))
    return out
