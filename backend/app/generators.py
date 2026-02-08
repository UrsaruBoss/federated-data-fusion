# app/generators.py
# ------------------------------------------------------------
# Synthetic data generators (demo/testing) with "ops-grade" logic:
# - Assets have routes and move between waypoints (no teleport jitter)
# - Events are generated near assets and severity follows a simple risk model
# - Alerts are correlated from events (deduped), not purely random
#
# Redis storage model (simple + demo-friendly):
# - assets:list -> list of asset_ids
# - events:list -> list of event_ids (recent)
# - alerts:list -> list of alert_ids (recent)
# - updates:stream -> list of JSON payloads for SSE
# - asset:<id>, event:<id>, alert:<id> -> JSON blobs
# ------------------------------------------------------------

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import random
import json
from typing import Dict, List, Tuple, Optional, Any

from .models import Event, Asset, Alert
from .redis_client import get_redis


# -------------------------------
# Redis keys
# -------------------------------
K_EVENTS = "events:list"          # list of event_ids (recent)
K_ASSETS = "assets:list"          # list of asset_ids
K_ALERTS = "alerts:list"          # list of alert_ids (recent)
K_UPDATES = "updates:stream"      # list of JSON messages (SSE pulls from here)

# Per-object keys:
#  asset:<asset_id>
#  event:<event_id>
#  alert:<alert_id>


# -------------------------------
# Helpers
# -------------------------------
def _push_update(r, payload: Dict[str, Any]) -> None:
    """
    payload example:
      {"type": "event_created", "data": {...}}
    """
    r.rpush(K_UPDATES, json.dumps(payload))
    # keep last N
    r.ltrim(K_UPDATES, -500, -1)


def _store_json(r, key: str, obj: Dict[str, Any], ttl: int = 0) -> None:
    r.set(key, json.dumps(obj))
    if ttl and ttl > 0:
        r.expire(key, ttl)


def iso_utc(dt: datetime) -> str:
    """
    Always return UTC ISO string with 'Z' suffix.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# -------------------------------
# Simulation primitives
# -------------------------------
def random_route(lat: float, lon: float, n: int = 4) -> List[Tuple[float, float]]:
    """
    Create a short coherent route (waypoints) starting at (lat, lon).
    Not geodesic-perfect, but visually consistent for demo.
    """
    route: List[Tuple[float, float]] = [(lat, lon)]
    cur_lat, cur_lon = lat, lon

    for _ in range(max(1, n - 1)):
        # moderate waypoint hops (not too chaotic)
        cur_lat += random.uniform(-1.2, 1.2)
        cur_lon += random.uniform(-1.8, 1.8)
        # keep inside "Europe-ish" box
        cur_lat = clamp(cur_lat, 35.0, 60.0)
        cur_lon = clamp(cur_lon, -10.0, 30.0)
        route.append((cur_lat, cur_lon))

    return route


def move_towards(
    a_lat: float,
    a_lon: float,
    b_lat: float,
    b_lon: float,
    step_deg: float = 0.02,
) -> Tuple[float, float, bool]:
    """
    Move from (a_lat, a_lon) towards (b_lat, b_lon) by 'step_deg' degrees.
    Returns: (new_lat, new_lon, arrived)
    """
    d_lat = b_lat - a_lat
    d_lon = b_lon - a_lon
    dist = (d_lat * d_lat + d_lon * d_lon) ** 0.5

    if dist <= step_deg:
        return b_lat, b_lon, True

    return (
        a_lat + (d_lat / dist) * step_deg,
        a_lon + (d_lon / dist) * step_deg,
        False,
    )


def _asset_risk(asset: Dict[str, Any]) -> float:
    """
    Simple risk score derived from asset status.
    """
    st = asset.get("status")
    base = 0.20
    if st == "degraded":
        base += 0.30
    elif st == "offline":
        base += 0.55
    return clamp(base, 0.0, 1.0)


def _risk_to_severity(risk: float) -> str:
    if risk >= 0.80:
        return "critical"
    if risk >= 0.60:
        return "high"
    if risk >= 0.35:
        return "medium"
    return "low"


def _event_to_priority(evt: Dict[str, Any]) -> Optional[str]:
    sev = evt.get("severity")
    if sev == "critical":
        return "p1"
    if sev == "high":
        return "p2"
    # you can still emit p3 for medium/low if you want noise,
    # but for "ops-grade" we keep alerts meaningful by default.
    return None


# -------------------------------
# Public API used by the app
# -------------------------------
def bootstrap_assets(n: int = 60) -> None:
    """
    Initialize a fleet of assets with routes and baseline parameters.
    Safe to call repeatedly; only runs if assets:list is empty.
    """
    r = get_redis()
    if r.llen(K_ASSETS) > 0:
        return

    for i in range(n):
        lat = random.uniform(35.0, 60.0)
        lon = random.uniform(-10.0, 30.0)

        # base Asset model (pydantic)
        a = Asset(
            name=f"Asset-{i:03d}",
            asset_type=random.choice(["sensor", "vehicle", "relay", "drone"]),
            lat=lat,
            lon=lon,
            status="active",
            last_update=iso_utc(datetime.utcnow()),
            owner_team=random.choice(["blue", "green", "white"]),
        ).model_dump(mode="json")

        # --- extra sim fields (frontend can ignore them safely) ---
        a["route"] = random_route(lat, lon, random.randint(3, 6))
        a["route_idx"] = 0
        a["speed_kmh"] = round(random.uniform(40, 90), 1)

        _store_json(r, f"asset:{a['asset_id']}", a)
        r.rpush(K_ASSETS, a["asset_id"])

    _push_update(r, {"type": "bootstrap", "data": {"assets": n}})


def update_assets() -> None:
    """
    Move a subset of assets each tick:
    - advance along route
    - small GPS jitter
    - occasional status degradation/offline
    """
    r = get_redis()
    ids = r.lrange(K_ASSETS, 0, -1)
    if not ids:
        return

    # update 2-5 assets per tick (tunable)
    k = min(len(ids), random.randint(2, 5))
    for asset_id in random.sample(ids, k=k):
        raw = r.get(f"asset:{asset_id}")
        if not raw:
            continue

        asset = json.loads(raw)

        route = asset.get("route") or []
        idx = int(asset.get("route_idx", 0))

        # if route exhausted, regenerate a new one from current position
        if idx >= len(route):
            asset["route"] = random_route(float(asset["lat"]), float(asset["lon"]), random.randint(3, 6))
            asset["route_idx"] = 0
            route = asset["route"]
            idx = 0

        target_lat, target_lon = route[idx]

        # Step size in degrees; you could scale by speed_kmh later
        new_lat, new_lon, arrived = move_towards(
            float(asset["lat"]),
            float(asset["lon"]),
            float(target_lat),
            float(target_lon),
            step_deg=0.03 if asset.get("asset_type") in ("drone", "vehicle") else 0.02,
        )

        # GPS drift jitter (tiny)
        new_lat += random.uniform(-0.004, 0.004)
        new_lon += random.uniform(-0.004, 0.004)

        asset["lat"] = clamp(new_lat, 35.0, 60.0)
        asset["lon"] = clamp(new_lon, -10.0, 30.0)

        if arrived:
            asset["route_idx"] = idx + 1

        # Status behavior (tunable):
        # - rare degraded
        # - rarer offline
        roll = random.random()
        if roll < 0.015:
            asset["status"] = "degraded"
        elif roll < 0.020:
            asset["status"] = "offline"
        else:
            # recover slowly sometimes
            if asset.get("status") in ("degraded", "offline") and random.random() < 0.03:
                asset["status"] = "active"

        asset["last_update"] = iso_utc(datetime.utcnow())

        _store_json(r, f"asset:{asset_id}", asset)
        _push_update(r, {"type": "asset_updated", "data": asset})


def generate_event() -> None:
    """
    Generate an event "near" an asset.
    Severity is derived from a simple risk score influenced by asset status.
    """
    r = get_redis()
    if r.llen(K_ASSETS) == 0:
        return

    asset_id = r.lindex(K_ASSETS, random.randint(0, r.llen(K_ASSETS) - 1))
    raw_a = r.get(f"asset:{asset_id}")
    if not raw_a:
        return

    asset = json.loads(raw_a)
    risk = _asset_risk(asset)

    # event type probabilities based on asset type/status (light logic)
    a_type = asset.get("asset_type", "sensor")
    if a_type == "relay":
        etype = random.choices(["comms", "anomaly", "movement"], weights=[0.5, 0.3, 0.2])[0]
    elif a_type == "vehicle":
        etype = random.choices(["movement", "incident", "anomaly"], weights=[0.55, 0.25, 0.20])[0]
    elif a_type == "drone":
        etype = random.choices(["movement", "anomaly", "weather"], weights=[0.45, 0.35, 0.20])[0]
    else:
        etype = random.choice(["incident", "movement", "anomaly", "weather"])

    # If asset is offline, "comms" anomalies are more likely
    if asset.get("status") == "offline":
        etype = random.choices(["comms", "anomaly", "incident"], weights=[0.55, 0.30, 0.15])[0]
        risk = clamp(risk + 0.10, 0.0, 1.0)

    severity = _risk_to_severity(risk)

    evt = Event(
        created_at=iso_utc(datetime.utcnow()),
        lat=float(asset["lat"]) + random.uniform(-0.25, 0.25),
        lon=float(asset["lon"]) + random.uniform(-0.25, 0.25),
        type=etype,
        severity=severity,
        source="synthetic",
        confidence=round(random.uniform(0.60, 0.95), 2),
        meta={
            "asset_id": asset_id,
            "owner_team": asset.get("owner_team"),
        },
    )

    evt_json = evt.model_dump(mode="json")
    _store_json(r, f"event:{evt.event_id}", evt_json)
    r.rpush(K_EVENTS, evt.event_id)
    r.ltrim(K_EVENTS, -300, -1)

    _push_update(r, {"type": "event_created", "data": evt_json})


def generate_alert() -> None:
    """
    Correlated alert generation:
    - Derives alert priority from most recent event severity
    - Dedupes identical alerts for a short window
    """
    r = get_redis()
    if r.llen(K_EVENTS) == 0:
        return

    event_id = r.lindex(K_EVENTS, -1)
    raw_evt = r.get(f"event:{event_id}")
    if not raw_evt:
        return

    evt = json.loads(raw_evt)
    priority = _event_to_priority(evt)
    if not priority:
        return

    related_asset_id = None
    if isinstance(evt.get("meta"), dict):
        related_asset_id = evt["meta"].get("asset_id")

    # Message templates based on type/severity
    et = evt.get("type", "event")
    sev = evt.get("severity", "medium")

    if et == "comms":
        msg = "Communications anomaly detected"
    elif et == "movement":
        msg = "Unusual movement pattern near asset"
    elif et == "incident":
        msg = "Incident reported near monitored corridor"
    elif et == "weather":
        msg = "Weather risk impacting operational area"
    else:
        msg = "Correlation rule triggered"

    # fingerprint for dedup
    fingerprint = f"{priority}:{evt.get('event_id')}:{related_asset_id}:{msg}"
    dedup_key = f"dedup:alert:{hash(fingerprint)}"
    if r.exists(dedup_key):
        return
    r.setex(dedup_key, 60, "1")  # dedup window (seconds)

    alr = Alert(
        created_at=iso_utc(datetime.utcnow()),
        priority=priority,
        message=f"{msg} (sev={sev})",
        related_event_id=evt.get("event_id"),
        related_asset_id=related_asset_id,
        fingerprint=fingerprint,
        expires_at=iso_utc(datetime.utcnow() + timedelta(minutes=5)),
    )

    alr_json = alr.model_dump(mode="json")
    _store_json(r, f"alert:{alr.alert_id}", alr_json, ttl=600)
    r.rpush(K_ALERTS, alr.alert_id)
    r.ltrim(K_ALERTS, -300, -1)

    _push_update(r, {"type": "alert_raised", "data": alr_json})
