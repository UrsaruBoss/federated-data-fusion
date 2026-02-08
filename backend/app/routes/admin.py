# app/routes/admin.py
# ------------------------------------------------------------
# Public admin controls (demo mode)
#
# No token. Instead:
# - Global cooldown (e.g., 5 minutes) to prevent spam
# - Short lock to avoid concurrent triggers
# - SSE notice broadcast so all clients understand what happened
# ------------------------------------------------------------

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Literal
import time
import hashlib

from ..redis_client import get_redis
from ..config import settings
from ..generators import (
    K_EVENTS, K_ASSETS, K_ALERTS, K_UPDATES,
    bootstrap_assets, _push_update
)

router = APIRouter(tags=["admin"])

ScenarioName = Literal["normal", "stress", "incident"]

K_SCENARIO = "sim:scenario"
K_RATE_EVENT = "sim:rate:event_sec"
K_RATE_ASSET = "sim:rate:asset_sec"
K_RATE_ALERT = "sim:rate:alert_sec"

K_ADMIN_COOLDOWN_UNTIL = "admin:cooldown_until"
K_ADMIN_LOCK = "admin:lock"

SCENARIO_PRESETS: Dict[str, Dict[str, int]] = {
    "normal": {"event": 6, "asset": 2, "alert": 3},
    "stress": {"event": 2, "asset": 1, "alert": 1},
    "incident": {"event": 3, "asset": 1, "alert": 1},
}

class ScenarioSetRequest(BaseModel):
    scenario: ScenarioName

def _actor_id(req: Request) -> str:
    # best-effort identity (demo-grade): IP + UA -> short hash
    ip = req.headers.get("x-forwarded-for") or (req.client.host if req.client else "unknown")
    ua = req.headers.get("user-agent", "")
    raw = f"{ip}|{ua}".encode("utf-8", errors="ignore")
    return hashlib.sha1(raw).hexdigest()[:6]

def _now() -> int:
    return int(time.time())

def _s(v, default: str = "") -> str:
    if v is None:
        return default
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", "ignore")
    return str(v)

def _acquire_lock(r) -> bool:
    # SET key value NX EX <sec>
    return bool(r.set(K_ADMIN_LOCK, "1", nx=True, ex=settings.admin_lock_sec))

def _set_cooldown(r):
    r.set(K_ADMIN_COOLDOWN_UNTIL, str(_now() + settings.admin_cooldown_sec))

def _announce(r, kind: str, data: Dict, actor: str):
    payload = {
        "kind": kind,
        "actor": actor,
        "ts": _now(),
        "cooldown_sec": settings.admin_cooldown_sec,
        "data": data,
    }
    _push_update(r, {"type": "admin_notice", "data": payload})

# app/routes/admin.py

def _cooldown_remaining(r) -> int:
    until = _s(r.get(K_ADMIN_COOLDOWN_UNTIL), "0").strip()
    try:
        until_i = int(until) if until else 0
    except Exception:
        until_i = 0
    return max(0, until_i - _now())


@router.get("/api/admin/state")
def admin_state():
    r = get_redis()

    scenario = _s(r.get(K_SCENARIO), "normal").strip().lower()
    if scenario not in SCENARIO_PRESETS:
        scenario = "normal"

    def _get_int(key: str, fallback: int) -> int:
        v = _s(r.get(key), "").strip()
        try:
            return int(v) if v else fallback
        except Exception:
            return fallback

    rates = {
        "event": _get_int(K_RATE_EVENT, SCENARIO_PRESETS[scenario]["event"]),
        "asset": _get_int(K_RATE_ASSET, SCENARIO_PRESETS[scenario]["asset"]),
        "alert": _get_int(K_RATE_ALERT, SCENARIO_PRESETS[scenario]["alert"]),
    }

    return {
        "scenario": scenario,
        "rates": rates,
        "cooldown_remaining": _cooldown_remaining(r),
    }


@router.post("/api/admin/scenario")
def set_scenario(body: ScenarioSetRequest, request: Request):
    r = get_redis()

    # lock to prevent double-click races
    if not _acquire_lock(r):
        raise HTTPException(status_code=409, detail="Admin operation busy, try again.")

    # cooldown
    rem = _cooldown_remaining(r)
    if rem > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Cooldown active. Try again in {rem}s."
        )

    scenario = body.scenario
    preset = SCENARIO_PRESETS[scenario]

    r.set(K_SCENARIO, scenario)
    r.set(K_RATE_EVENT, preset["event"])
    r.set(K_RATE_ASSET, preset["asset"])
    r.set(K_RATE_ALERT, preset["alert"])
    _set_cooldown(r)

    actor = _actor_id(request)
    _announce(r, "scenario_changed", {"scenario": scenario, "rates": preset}, actor)

    return {"ok": True, "scenario": scenario, "rates": preset, "cooldown_sec": settings.admin_cooldown_sec}

@router.post("/api/admin/reset")
def reset_simulation(request: Request):
    r = get_redis()

    if not _acquire_lock(r):
        raise HTTPException(status_code=409, detail="Admin operation busy, try again.")

    rem = _cooldown_remaining(r)
    if rem > 0:
        raise HTTPException(status_code=429, detail=f"Cooldown active. Try again in {rem}s.")

    # delete payloads based on current ids
    event_ids = r.lrange(K_EVENTS, 0, -1)
    asset_ids = r.lrange(K_ASSETS, 0, -1)
    alert_ids = r.lrange(K_ALERTS, 0, -1)

    pipe = r.pipeline(transaction=False)
    for eid in event_ids:
        pipe.delete(f"event:{eid}")
    for aid in asset_ids:
        pipe.delete(f"asset:{aid}")
    for alid in alert_ids:
        pipe.delete(f"alert:{alid}")

    pipe.delete(K_EVENTS)
    pipe.delete(K_ASSETS)
    pipe.delete(K_ALERTS)
    pipe.delete(K_UPDATES)
    pipe.execute()

    bootstrap_assets()
    _set_cooldown(r)

    actor = _actor_id(request)
    _announce(r, "simulation_reset", {"rebootstrapped_assets": True}, actor)

    return {
        "ok": True,
        "deleted": {"events": len(event_ids), "assets": len(asset_ids), "alerts": len(alert_ids)},
        "cooldown_sec": settings.admin_cooldown_sec,
    }
