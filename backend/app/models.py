# app/models.py
# ------------------------------------------------------------
# Core domain models for the Federated Data Fusion demo backend
# ------------------------------------------------------------

from pydantic import BaseModel, Field
from typing import Optional, Literal, Dict, Any, List
from datetime import datetime, timezone
import uuid


# -------------------------------
# Shared helpers & enums
# -------------------------------
Severity = Literal["low", "medium", "high", "critical"]
AssetStatus = Literal["active", "degraded", "offline"]
AlertPriority = Literal["p3", "p2", "p1"]


def uid(prefix: str) -> str:
    """
    Short, readable IDs for UI/debugging.
    Example: evt_a3f91c2b1e
    """
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def utcnow() -> datetime:
    """
    Always return timezone-aware UTC datetime.
    """
    return datetime.now(timezone.utc)


# -------------------------------
# Event
# -------------------------------
class Event(BaseModel):
    """
    Represents a detected or inferred situation in space/time.
    """

    event_id: str = Field(default_factory=lambda: uid("evt"))
    created_at: datetime = Field(default_factory=utcnow)

    lat: float
    lon: float

    type: str
    severity: Severity

    source: str = "synthetic"
    confidence: float = Field(default=0.75, ge=0.0, le=1.0)

    # Arbitrary metadata (asset linkage, region, etc.)
    meta: Dict[str, Any] = Field(default_factory=dict)


# -------------------------------
# Asset
# -------------------------------
class Asset(BaseModel):
    """
    Represents a monitored entity (sensor, vehicle, drone, relay).
    """

    asset_id: str = Field(default_factory=lambda: uid("ast"))

    name: str
    asset_type: str

    lat: float
    lon: float

    status: AssetStatus = "active"
    last_update: datetime = Field(default_factory=utcnow)

    owner_team: str = "blue"

    # --- Optional simulation extensions ---
    # These are ignored by the frontend unless explicitly used.
    route: Optional[List[List[float]]] = None   # [[lat, lon], ...]
    route_idx: Optional[int] = None
    speed_kmh: Optional[float] = None


# -------------------------------
# Alert
# -------------------------------
class Alert(BaseModel):
    """
    Represents a correlated warning requiring attention.
    """

    alert_id: str = Field(default_factory=lambda: uid("alr"))
    created_at: datetime = Field(default_factory=utcnow)

    priority: AlertPriority
    message: str

    related_event_id: Optional[str] = None
    related_asset_id: Optional[str] = None

    # Used internally for deduplication / correlation
    fingerprint: str

    expires_at: Optional[datetime] = None
