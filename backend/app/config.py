# app/config.py
# ------------------------------------------------------------
# Central configuration using pydantic-settings.
#
# All values can be overridden via environment variables.
# ------------------------------------------------------------

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """
    Runtime configuration for the backend.
    """

    # --------------------------------------------------------
    # Admin settings for demo controls (scenario/reset)
    # --------------------------------------------------------

    admin_cooldown_sec: int = 300   # 5 minutes
    admin_lock_sec: int = 10        # prevent concurrent "double fire"

    # --------------------------------------------------------
    # Infrastructure
    # --------------------------------------------------------
    redis_url: str = "redis://localhost:6379/0"

    # --------------------------------------------------------
    # CORS / Frontend integration
    # --------------------------------------------------------
    api_cors_origins: str = (
        "http://localhost:5173,"
        "http://localhost:3000"
    )

    # --------------------------------------------------------
    # Simulation toggles
    # --------------------------------------------------------
    generators_enabled: bool = True

    # --------------------------------------------------------
    # Simulation rates (seconds)
    # --------------------------------------------------------
    event_rate_sec: int = 6
    asset_rate_sec: int = 2
    alert_rate_sec: int = 3

    # --------------------------------------------------------
    # Helpers
    # --------------------------------------------------------
    def cors_list(self) -> List[str]:
        """
        Parse comma-separated CORS origins into a clean list.
        """
        return [
            x.strip()
            for x in self.api_cors_origins.split(",")
            if x.strip()
        ]


# Singleton settings object
settings = Settings()
