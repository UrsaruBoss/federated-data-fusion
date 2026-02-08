# app/routes/health.py
# ------------------------------------------------------------
# Health & metrics endpoint
#
# Purpose:
# - quick liveness check
# - counts for UI chips
# - basic stream backlog visibility
# ------------------------------------------------------------

from fastapi import APIRouter, Request
from datetime import datetime, timezone
import time

from ..redis_client import get_redis
from ..generators import K_EVENTS, K_ASSETS, K_ALERTS, K_UPDATES

router = APIRouter(tags=["health"])

# server start reference (module load time)
STARTED_AT = datetime.now(timezone.utc)

def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _safe_parse_iso(v):
    # Accept ISO strings or return None
    if not v:
        return None
    try:
        # allow "Z"
        if isinstance(v, bytes):
            v = v.decode("utf-8", "ignore")
        s = str(v)
        if s.endswith("Z"):
            s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return None

@router.get("/api/health")
def health(request: Request):
    """
    Health status for the dashboard.

    Returns:
    - ok, utc
    - started_at, uptime_seconds
    - counts
    - stream_backlog
    - redis (optional info)
    - freshness (server-side latest timestamps)
    - latency_ms (server-measured for this handler)
    """
    t0 = time.perf_counter()
    r = get_redis()

    # --- counts
    counts = {
        "events": r.llen(K_EVENTS),
        "assets": r.llen(K_ASSETS),
        "alerts": r.llen(K_ALERTS),
    }
    stream_backlog = r.llen(K_UPDATES)

    # --- redis info (safe)
    redis_ok = True
    redis_info = {}
    try:
        r.ping()
        info = r.info()
        # pick a small, stable subset
        redis_info = {
            "ok": True,
            "host": getattr(r.connection_pool.connection_kwargs, "get", lambda k, d=None: d)("host", None)
                    if hasattr(r, "connection_pool") else None,
            "db": getattr(r.connection_pool.connection_kwargs, "get", lambda k, d=None: d)("db", None)
                  if hasattr(r, "connection_pool") else None,
            "hits": info.get("keyspace_hits"),
            "misses": info.get("keyspace_misses"),
        }
    except Exception:
        redis_ok = False
        redis_info = {"ok": False}

    # --- freshness: latest timestamps from lists (cheap)
    # If your lists store JSON strings, we try to parse last element and read created_at/last_update.
    # --- freshness: latest timestamps (correct for your storage model)
    freshness = {"events_latest": None, "assets_latest": None, "alerts_latest": None}

    def _latest_time_from_id_list(list_key: str, obj_prefix: str, field_candidates: list[str]):
        """
        list_key holds IDs, e.g. events:list -> ["evt_..", ...]
        objects stored at f"{obj_prefix}:{id}" -> JSON blob
        """
        try:
            last_id = r.lindex(list_key, -1)
            if not last_id:
                return None

            # bytes -> str
            if isinstance(last_id, bytes):
                last_id = last_id.decode("utf-8", "ignore")

            raw_obj = r.get(f"{obj_prefix}:{last_id}")
            if not raw_obj:
                return None

            import json
            obj = json.loads(raw_obj)

            for f in field_candidates:
                v = obj.get(f)
                if v:
                    return _safe_parse_iso(v)

            return None
        except Exception:
            return None

    freshness["events_latest"] = _latest_time_from_id_list(
        K_EVENTS, "event", ["created_at", "utc", "t"]
    )

    freshness["assets_latest"] = _latest_time_from_id_list(
        K_ASSETS, "asset", ["last_update", "updated_at", "created_at", "utc"]
    )

    freshness["alerts_latest"] = _latest_time_from_id_list(
        K_ALERTS, "alert", ["created_at", "utc", "t"]
    )

    # --- uptime
    now = datetime.now(timezone.utc)
    uptime_seconds = int((now - STARTED_AT).total_seconds())

    latency_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "ok": True if redis_ok else True,  # keep ok true if API is up; use redis.ok for dependency state
        "utc": _utc_now_iso(),
        "started_at": STARTED_AT.isoformat().replace("+00:00", "Z"),
        "uptime_seconds": uptime_seconds,
        "counts": counts,
        "stream_backlog": stream_backlog,
        "redis": redis_info,
        "freshness": freshness,
        "latency_ms": latency_ms,
    }
