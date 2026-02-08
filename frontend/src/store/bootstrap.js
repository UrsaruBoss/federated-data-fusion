// src/store/bootstrap.js
import { getJson, openSSE } from "../api/client";
import { setEvents, upsertEvent } from "./eventsSlice";
import { setAssets, upsertAsset } from "./assetsSlice";
import { setAlerts, upsertAlert } from "./alertsSlice";
import { setHealth, setFullSyncMeta, pushSystemError } from "./systemSlice";
import { setSseState, markSseEvent } from "./systemSlice";

/**
 * Increment this when you change the cache payload schema.
 * This version is embedded into localStorage keys so old caches are ignored.
 */
const CACHE_VERSION = 1;

/**
 * Namespaced localStorage keys for cache persistence.
 * Includes CACHE_VERSION to invalidate safely after schema changes.
 */
const LS_KEYS = {
  events: `fdf_cache_v${CACHE_VERSION}:events`,
  assets: `fdf_cache_v${CACHE_VERSION}:assets`,
  alerts: `fdf_cache_v${CACHE_VERSION}:alerts`,
  meta: `fdf_cache_v${CACHE_VERSION}:meta`,
};

/**
 * Safe JSON.parse wrapper.
 * Returns null if parsing fails (corrupt cache, partial writes, etc.).
 */
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Load cached datasets (and metadata) from localStorage.
 * Returns null for each section if missing or invalid JSON.
 */
function loadCache() {
  const meta = safeParse(localStorage.getItem(LS_KEYS.meta) || "") || null;
  const events = safeParse(localStorage.getItem(LS_KEYS.events) || "") || null;
  const assets = safeParse(localStorage.getItem(LS_KEYS.assets) || "") || null;
  const alerts = safeParse(localStorage.getItem(LS_KEYS.alerts) || "") || null;
  return { meta, events, assets, alerts };
}

/**
 * Save datasets to localStorage along with a timestamp.
 * The meta timestamp is used for freshness checks (TTL).
 */
function saveCache({ events, assets, alerts }) {
  const meta = { savedAt: new Date().toISOString() };
  localStorage.setItem(LS_KEYS.meta, JSON.stringify(meta));
  localStorage.setItem(LS_KEYS.events, JSON.stringify(events || []));
  localStorage.setItem(LS_KEYS.assets, JSON.stringify(assets || []));
  localStorage.setItem(LS_KEYS.alerts, JSON.stringify(alerts || []));
}

/**
 * Checks whether the cache is still fresh based on TTL.
 *
 * @param {Object|null} meta - cache metadata { savedAt: ISO string }
 * @param {number} ttlMs - time-to-live in milliseconds
 * @returns {boolean} true if cache is usable
 */
function isFresh(meta, ttlMs) {
  if (!meta?.savedAt) return false;
  const t = new Date(meta.savedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ttlMs;
}

/**
 * startDataLayer
 * --------------
 * Bootstraps the app’s data flow:
 * 1) Hydrate from localStorage cache (instant UI)
 * 2) Full sync from network on interval (authoritative state)
 * 3) Frequent health polling
 * 4) One global SSE connection for realtime upserts
 *
 * Returns a stop() cleanup function used by AppLayout on unmount.
 */
export function startDataLayer(dispatch, options = {}) {
  const {
    fullSyncTtlMs = 90_000,       // Cache freshness window (~1.5 min)
    fullSyncIntervalMs = 120_000, // Full refresh every 2 min
    healthIntervalMs = 3_000,     // Health polling frequency
  } = options;

  /**
   * Stop flag prevents setState/dispatch after teardown.
   * (Important since we have async fetches and intervals.)
   */
  let stopped = false;

  // 1) Hydrate from cache for fast initial render (if still fresh)
  const { meta, events, assets, alerts } = loadCache();
  if (isFresh(meta, fullSyncTtlMs)) {
    dispatch(setEvents(events || []));
    dispatch(setAssets(assets || []));
    dispatch(setAlerts(alerts || []));
    dispatch(setFullSyncMeta({ source: "cache" }));
  }

  /**
   * Full sync:
   * Fetches the latest snapshots for events/assets/alerts and replaces store state.
   * Also refreshes localStorage cache for next reload.
   */
  async function fullSync() {
    try {
      const [ev, as, al] = await Promise.all([
        getJson("/api/events?limit=120"),
        getJson("/api/assets?limit=200"),
        getJson("/api/alerts?limit=120"),
      ]);

      // If stop() was called while the requests were in-flight, bail out
      if (stopped) return;

      // Replace store state with authoritative server snapshots
      dispatch(setEvents(ev.items || []));
      dispatch(setAssets(as.items || []));
      dispatch(setAlerts(al.items || []));
      dispatch(setFullSyncMeta({ source: "network" }));

      // Persist snapshot into cache for faster reloads
      saveCache({ events: ev.items, assets: as.items, alerts: al.items });
    } catch (e) {
      // Surface the error to a system log/toast layer
      dispatch(pushSystemError(`Full sync failed: ${e?.message || e}`));
    }
  }

  /**
   * Health poll:
   * Keeps "API OK / DEGRADED" state updated for UI indicators.
   */
  async function pollHealth() {
    try {
      const h = await getJson("/api/health");
      if (stopped) return;
      dispatch(setHealth(h));
    } catch (e) {
      // If health endpoint fails, mark as degraded
      dispatch(setHealth({ ok: false, error: String(e?.message || e) }));
    }
  }

  // 2) If cache is not fresh, do an immediate full sync to populate state
  if (!isFresh(meta, fullSyncTtlMs)) {
    fullSync();
  }

  // 3) Start background intervals
  const tFull = setInterval(fullSync, fullSyncIntervalMs);
  const tHealth = setInterval(pollHealth, healthIntervalMs);
  pollHealth(); // initial health check right away

  // 4) Global SSE (single connection for realtime updates)
  dispatch(setSseState("connecting"));

  /**
   * openSSE registers handlers for named server events.
   * Each event updates the relevant slice via upsert and marks "last SSE seen".
   */
  const es = openSSE("/api/stream", {
    hello: () => {
      dispatch(setSseState("connected"));
      dispatch(markSseEvent());
    },
    heartbeat: () => {
      dispatch(setSseState("connected"));
      dispatch(markSseEvent());
    },
    event_created: (data) => {
      dispatch(upsertEvent(data));
      dispatch(markSseEvent());
    },
    asset_updated: (data) => {
      dispatch(upsertAsset(data));
      dispatch(markSseEvent());
    },
    alert_raised: (data) => {
      dispatch(upsertAlert(data));
      dispatch(markSseEvent());
    },
  });

  // Some browsers fire `onopen` for SSE connection establishment
  es.onopen = () => dispatch(setSseState("connected"));

  // Generic connection error (network drop, server down, etc.)
  es.onerror = () => dispatch(setSseState("down"));

  /**
   * Cleanup / stop function:
   * - marks stopped so in-flight requests don’t dispatch
   * - clears intervals
   * - closes SSE connection
   */
  return () => {
    stopped = true;
    clearInterval(tFull);
    clearInterval(tHealth);
    try {
      es?.close?.();
    } catch {}
  };
}
