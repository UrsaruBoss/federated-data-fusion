# app/redis_client.py
# ------------------------------------------------------------
# Centralized Redis connection helper.
#
# Using a single function ensures:
# - Consistent configuration
# - Easy swap to Redis Cluster / Sentinel later
# - Clean dependency isolation
# ------------------------------------------------------------

import redis
from .config import settings


def get_redis() -> redis.Redis:
    """
    Returns a Redis client instance.

    - decode_responses=True ensures all values are returned as str
      (important for JSON handling and SSE payloads).
    """
    return redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
    )
