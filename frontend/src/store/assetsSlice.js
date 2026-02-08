// src/store/assetsSlice.js
import { createSlice } from "@reduxjs/toolkit";

/**
 * Assets slice
 * ------------
 * Stores asset entities in a normalized structure:
 * - `items`: array used for rendering and iteration
 * - `byId`: lookup map for O(1) access by asset_id
 *
 * Optimized for:
 * - frequent incremental updates (polling / SSE)
 * - bounded memory usage
 */
const assetsSlice = createSlice({
  name: "assets",

  /**
   * Initial state:
   * - items: list of asset objects
   * - byId: normalized lookup table
   */
  initialState: {
    items: [],
    byId: {},
  },

  reducers: {
    /**
     * setAssets
     * ---------
     * Replaces the entire assets state at once.
     * Typically used for:
     * - initial load
     * - full refresh from backend
     *
     * Payload: array of asset objects
     */
    setAssets(state, action) {
      state.items = action.payload || [];

      // Rebuild lookup map from scratch
      state.byId = {};
      for (const a of state.items) {
        state.byId[a.asset_id] = a;
      }
    },

    /**
     * upsertAsset
     * -----------
     * Inserts or updates a single asset.
     * Used for:
     * - real-time updates (SSE / WebSocket)
     * - incremental polling
     *
     * Behavior:
     * - updates normalized lookup (byId)
     * - replaces existing item or prepends new one
     * - caps list length to prevent unbounded growth
     */
    upsertAsset(state, action) {
      const a = action.payload;

      // Defensive guard against invalid payloads
      if (!a?.asset_id) return;

      // Update normalized lookup
      state.byId[a.asset_id] = a;

      // Find asset in items array
      const idx = state.items.findIndex(x => x.asset_id === a.asset_id);

      if (idx >= 0) {
        // Replace existing asset
        state.items[idx] = a;
      } else {
        // Insert new asset at the top
        state.items.unshift(a);
      }

      // Hard cap to limit memory usage and render cost
      state.items = state.items.slice(0, 500);
    },
  },
});

// Export actions for dispatch
export const { setAssets, upsertAsset } = assetsSlice.actions;

// Export reducer for store registration
export default assetsSlice.reducer;
