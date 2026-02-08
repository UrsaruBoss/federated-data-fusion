// src/store/systemSlice.js
import { createSlice } from "@reduxjs/toolkit";

/**
 * System slice
 * ------------
 * Holds global, cross-cutting application state that does not belong
 * to a single domain entity (events/assets/alerts).
 *
 * Responsibilities:
 * - API health status
 * - Full sync metadata (timestamps + data source)
 * - SSE connection state and heartbeat tracking
 * - System-level error log
 */
const systemSlice = createSlice({
  name: "system",

  /**
   * Initial system state
   */
  initialState: {
    // Result of /api/health endpoint
    health: null,

    // Timestamps (UTC ISO strings)
    lastFullSyncUtc: null,
    lastHealthUtc: null,

    // Data source indicator for UI ("cache", "network", "cold_start")
    source: "cold_start",

    // Rolling list of system errors (bounded)
    errors: [],

    // Server-Sent Events connection status
    sse: {
      state: "connecting", // "connecting" | "connected" | "down"
      lastEventUtc: null,  // last time an SSE message was received
    },
  },

  reducers: {
    /**
     * setHealth
     * ---------
     * Updates API health status and records the timestamp.
     */
    setHealth(state, action) {
      state.health = action.payload || null;
      state.lastHealthUtc = new Date().toISOString();
    },

    /**
     * setSseState
     * -----------
     * Updates the current SSE connection state.
     */
    setSseState(state, action) {
      state.sse.state = action.payload || "connecting";
    },

    /**
     * markSseEvent
     * ------------
     * Marks the receipt of an SSE event (heartbeat or data).
     * Used to detect stale or dropped SSE connections.
     */
    markSseEvent(state) {
      state.sse.lastEventUtc = new Date().toISOString();
    },

    /**
     * setFullSyncMeta
     * ---------------
     * Records metadata about the last full synchronization.
     *
     * Payload:
     * - source: "cache" | "network"
     */
    setFullSyncMeta(state, action) {
      const { source } = action.payload || {};
      state.lastFullSyncUtc = new Date().toISOString();
      state.source = source || state.source;
    },

    /**
     * pushSystemError
     * ---------------
     * Adds a system-level error to the error log.
     * The list is capped to prevent unbounded growth.
     */
    pushSystemError(state, action) {
      const msg = String(action.payload || "Unknown error");
      state.errors.unshift({ t: new Date().toISOString(), msg });

      // Keep only the most recent 20 errors
      state.errors = state.errors.slice(0, 20);
    },

    /**
     * clearSystemErrors
     * -----------------
     * Clears all recorded system errors.
     */
    clearSystemErrors(state) {
      state.errors = [];
    },
  },
});

// Export action creators
export const {
  setHealth,
  setFullSyncMeta,
  pushSystemError,
  clearSystemErrors,
  setSseState,
  markSseEvent,
} = systemSlice.actions;

// Export reducer for store registration
export default systemSlice.reducer;
