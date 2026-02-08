# app/routes/assets.py
# ------------------------------------------------------------
# Assets API
#
# Returns the latest known assets stored in Redis.
# Used by:
# - OpsView DataGrid
# - Map2D markers
# - WallView aggregates
# ------------------------------------------------------------

from fastapi import APIRouter, Query
from ..redis_client import get_redis
from ..generators import K_ASSETS
from ._common import fetch_items_by_ids

router = APIRouter(tags=["assets"])


@router.get("/api/assets")
def list_assets(limit: int = Query(200, ge=1, le=1000)):
    """
    List assets (most recent state for each asset).

    Note:
    - Assets list order is the insertion order from bootstrap.
    - We return up to `limit` items.
    """
    r = get_redis()

    total = r.llen(K_ASSETS)
    if total <= 0:
        return {"items": []}

    # lrange end index is inclusive
    end = min(limit - 1, total - 1)
    ids = r.lrange(K_ASSETS, 0, end)

    out = fetch_items_by_ids(r, ids, key_prefix="asset")
    return {"items": out}
