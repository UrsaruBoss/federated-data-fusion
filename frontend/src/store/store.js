// src/store/store.js
import { configureStore } from "@reduxjs/toolkit";
import eventsReducer from "./eventsSlice";
import assetsReducer from "./assetsSlice";
import alertsReducer from "./alertsSlice";
import systemReducer from "./systemSlice";

/**
 * Redux store
 * -----------
 * Central application state container.
 *
 * Registered slices:
 * - events: event feed + map data (normalized)
 * - assets: tracked assets and their states
 * - alerts: alert stream and notifications
 * - system: global system state (health, SSE status, sync metadata, errors)
 *
 * Uses Redux Toolkit defaults:
 * - Immer for immutable updates
 * - Redux DevTools enabled in development
 * - Good default middleware configuration
 */
export const store = configureStore({
  reducer: {
    events: eventsReducer,
    assets: assetsReducer,
    alerts: alertsReducer,
    system: systemReducer,
  },
});
