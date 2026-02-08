// src/store/eventsSlice.js
import { createSlice } from "@reduxjs/toolkit";

/**
 * Events slice
 * ------------
 * Stores event entities in a normalized structure:
 * - `items`: ordered array used for feeds, maps, and timelines
 * - `byId`: lookup table for O(1) access by event_id
 *
 * Designed for:
 * - frequent realtime updates (SSE / polling)
 * - chronological ordering (newest first)
 * - bounded memory usage
 */
const eventsSlice = createSlice({
  name: "events",

  /**
   * Initial state:
   * - items: array of event objects
   * - byId: normalized map { [event_id]: event }
   */
  initialState: {
    items: [],
    byId: {},
  },

  reducers: {
    /**
     * setEvents
     * ---------
     * Replaces the entire events state.
     * Used for:
     * - initial load
     * - full resync from backend
     *
     * Payload: array of event objects
     */
    setEvents(state, action) {
      state.items = action.payload || [];

      // Rebuild lookup map from scratch
      state.byId = {};
      for (const e of state.items) {
        state.byId[e.event_id] = e;
      }
    },

    /**
     * upsertEvent
     * -----------
     * Inserts or updates a single event.
     * Used for:
     * - SSE / realtime streaming
     * - incremental polling updates
     *
     * Behavior:
     * - updates normalized lookup table
     * - replaces existing event or prepends new one
     * - keeps items sorted by `created_at` (newest first)
     * - trims list to a fixed maximum size
     */
    upsertEvent(state, action) {
      const e = action.payload;

      // Defensive guard against invalid payloads
      if (!e?.event_id) return;

      // Update normalized lookup
      state.byId[e.event_id] = e;

      // Find existing event in items array
      const existingIdx = state.items.findIndex(x => x.event_id === e.event_id);

      if (existingIdx >= 0) {
        // Replace existing event
        state.items[existingIdx] = e;
      } else {
        // Insert new event at the top
        state.items.unshift(e);
      }

      // Ensure newest-first ordering
      state.items.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      // Hard cap to prevent unbounded memory growth
      state.items = state.items.slice(0, 300);
    },
  },
});

// Export action creators
export const { setEvents, upsertEvent } = eventsSlice.actions;

// Export reducer for store registration
export default eventsSlice.reducer;
