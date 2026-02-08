# app/routes/alerts.py
# ------------------------------------------------------------
# Alerts API
#
# Alerts are stored as:
# - K_ALERTS: list of alert_ids (tail is newest)
# - alert:<id>: JSON payload (may have TTL)
# ------------------------------------------------------------

from fastapi import APIRouter, Query
from ..redis_client import get_redis
from ..generators import K_ALERTS
from ._common import fetch_items_by_ids

router = APIRouter(tags=["alerts"])


@router.get("/api/alerts")
def list_alerts(limit: int = Query(50, ge=1, le=300)):
    """
    List recent alerts (newest first).

    Alerts may expire (TTL), so missing payloads are skipped.
    """
    r = get_redis()

    total = r.llen(K_ALERTS)
    if total <= 0:
        return {"items": []}

    ids = r.lrange(K_ALERTS, -limit, -1)
    ids = list(reversed(ids))

    out = fetch_items_by_ids(r, ids, key_prefix="alert")
    return {"items": out}
