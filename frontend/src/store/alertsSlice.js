// src/store/alertsSlice.js
import { createSlice } from "@reduxjs/toolkit";

/**
 * Alerts slice
 * ------------
 * Manages alert data in two parallel structures:
 * - `items`: ordered array (used for rendering lists / feeds)
 * - `byId`: object map for O(1) lookup by alert_id
 *
 * This dual structure gives:
 * - fast access by ID
 * - stable ordering + easy truncation for UI
 */
const alertsSlice = createSlice({
  name: "alerts",

  /**
   * Initial state:
   * - items: array of alert objects (sorted by created_at, newest first)
   * - byId: normalized map { [alert_id]: alert }
   */
  initialState: {
    items: [],
    byId: {},
  },

  reducers: {
    /**
     * setAlerts
     * ---------
     * Replaces the entire alerts state at once.
     * Typically used for:
     * - initial load
     * - full refresh / resync from backend
     *
     * Payload: array of alert objects
     */
    setAlerts(state, action) {
      state.items = action.payload || [];

      // Rebuild lookup table from scratch
      state.byId = {};
      for (const a of state.items) {
        state.byId[a.alert_id] = a;
      }
    },

    /**
     * upsertAlert
     * -----------
     * Inserts or updates a single alert.
     * Used for:
     * - real-time updates (SSE / WebSocket)
     * - incremental polling updates
     *
     * Behavior:
     * - updates byId for O(1) access
     * - replaces existing item in array OR prepends if new
     * - re-sorts by created_at (newest first)
     * - trims list to last 300 alerts
     */
    upsertAlert(state, action) {
      const a = action.payload;

      // Defensive guard: ignore invalid payloads
      if (!a?.alert_id) return;

      // Update normalized map
      state.byId[a.alert_id] = a;

      // Find existing alert in items array
      const idx = state.items.findIndex(x => x.alert_id === a.alert_id);

      if (idx >= 0) {
        // Replace existing alert
        state.items[idx] = a;
      } else {
        // Insert new alert at the top (optimistic ordering)
        state.items.unshift(a);
      }

      // Ensure alerts are ordered by creation time (newest first)
      state.items.sort(
        (x, y) => new Date(y.created_at) - new Date(x.created_at)
      );

      // Hard cap to prevent unbounded memory growth
      state.items = state.items.slice(0, 300);
    },
  },
});

// Export actions for dispatching
export const { setAlerts, upsertAlert } = alertsSlice.actions;

// Export reducer for store registration
export default alertsSlice.reducer;
