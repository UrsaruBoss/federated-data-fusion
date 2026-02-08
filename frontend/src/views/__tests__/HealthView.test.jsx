// src/views/__tests__/HealthView.test.jsx
import React from "react";
import HealthView from "../HealthView";
import { renderWithStore } from "../../utils/test-utils";
import "@testing-library/jest-dom";

/**
 * mkState
 * -------
 * Builds a minimal-but-realistic Redux preloaded state for HealthView tests.
 *
 * Notes:
 * - HealthView reads from `state.system.*`
 * - We provide sensible defaults, then allow per-test overrides.
 * - Optional backend fields (redis/freshness) are included in defaults so
 *   we can test those UI branches as well.
 */
function mkState(overrides = {}) {
  return {
    system: {
      health: {
        ok: true,
        uptime_seconds: 120,
        counts: { events: 2, assets: 5, alerts: 1 },

        // Optional health payload fields (only rendered if provided)
        redis: { ok: true, host: "redis", db: 0, hits: 10, misses: 5 },
        freshness: {
          events_latest: "2026-02-07T12:00:00.000Z",
          assets_latest: "2026-02-07T12:00:00.000Z",
          alerts_latest: "2026-02-07T12:00:00.000Z",
        },
      },

      // Client-observed timestamps (set by systemSlice reducers)
      lastHealthUtc: "2026-02-07T12:10:00.000Z",
      lastFullSyncUtc: "2026-02-07T12:05:00.000Z",

      // Source marker used by UI ("cache" vs "network"/"live"/etc.)
      source: "live",

      // SSE connection telemetry
      sse: { state: "connected", lastEventUtc: "2026-02-07T12:11:00.000Z" },

      // Client-side error log
      errors: [],

      // Allow caller to override any system fields (shallow merge at system level)
      ...overrides.system,
    },
  };
}

describe("HealthView", () => {
  test("shows API OPERATIONAL when health.ok = true", () => {
    // Arrange: health.ok true => UI should display OPERATIONAL
    const preloadedState = mkState({ system: { health: { ok: true } } });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      // Provide a minimal reducer stub so the store can initialize.
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/API OPERATIONAL/i)).toBeInTheDocument();
  });

  test("shows API DEGRADED when health.ok = false", () => {
    // Arrange: health.ok false => UI should display DEGRADED
    const preloadedState = mkState({ system: { health: { ok: false } } });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/API DEGRADED/i)).toBeInTheDocument();
  });

  test("renders counts chips (Events/Assets/Alerts)", () => {
    // Arrange: override counts and verify chips reflect them
    const preloadedState = mkState({
      system: { health: { counts: { events: 9, assets: 8, alerts: 7 } } },
    });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert: chip labels include the numeric counts
    expect(getByText(/Events:\s*9/i)).toBeInTheDocument();
    expect(getByText(/Assets:\s*8/i)).toBeInTheDocument();
    expect(getByText(/Alerts:\s*7/i)).toBeInTheDocument();
  });

  test("shows Source chip text (LIVE/CACHED)", () => {
    // Arrange: source "cache" should be displayed (UI may render "CACHED")
    const preloadedState = mkState({ system: { source: "cache" } });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/Source:\s*CACHE/i)).toBeInTheDocument();
  });

  test("SSE state reflects redux (CONNECTED)", () => {
    // Arrange: SSE connected => state shown as CONNECTED
    const preloadedState = mkState({ system: { sse: { state: "connected" } } });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/CONNECTED/i)).toBeInTheDocument();
  });

  test("SSE state defaults to CONNECTING when missing", () => {
    // Arrange: missing sse object => UI should fall back to CONNECTING
    const preloadedState = mkState({ system: { sse: null } });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/CONNECTING/i)).toBeInTheDocument();
  });

  test("renders client errors list when present", () => {
    // Arrange: prepopulate errors => UI should show them
    const preloadedState = mkState({
      system: {
        errors: [
          { t: "2026-02-07T12:00:00.000Z", msg: "Boom 1" },
          { t: "2026-02-07T12:01:00.000Z", msg: "Boom 2" },
        ],
      },
    });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/Boom 1/i)).toBeInTheDocument();
    expect(getByText(/Boom 2/i)).toBeInTheDocument();
  });

  test("shows 'No client-side errors recorded' when none", () => {
    // Arrange: no errors => UI should show empty-state copy
    const preloadedState = mkState({ system: { errors: [] } });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/No client-side errors recorded/i)).toBeInTheDocument();
  });

  test("shows uptime formatted (uses uptime_seconds)", () => {
    // Arrange: 65 seconds => formatter should produce "1m 5s"
    const preloadedState = mkState({
      system: { health: { uptime_seconds: 65 } },
    });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/1m 5s/i)).toBeInTheDocument();
  });

  test("falls back to '—' when optional fields missing", () => {
    /**
     * This test validates that HealthView is resilient to sparse/partial payloads:
     * - optional sections (redis/freshness) should simply not render
     * - missing timestamps and counts should show "—" placeholders
     * - the SSE endpoint text should still render (static UI)
     */
    const preloadedState = mkState({
      system: {
        health: {
          ok: true,
          uptime_seconds: null,
          counts: { events: null, assets: null, alerts: null },
          redis: null,
          freshness: null,
        },
        lastHealthUtc: null,
        lastFullSyncUtc: null,
        source: null,
        sse: null,
        errors: [],
      },
    });

    const { getAllByText, getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert: at least one placeholder dash exists in UI
    expect(getAllByText("—").length).toBeGreaterThan(0);

    // Assert: endpoint should still be shown even without SSE state
    expect(getByText("/api/stream")).toBeInTheDocument();
  });

  test("redis shows HEALTHY when redis.ok=true", () => {
    // Arrange: redis ok => dependency chip should show HEALTHY
    const preloadedState = mkState({
      system: { health: { redis: { ok: true, host: "localhost", db: 0, hits: 5, misses: 1 } } },
    });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert: dependency panel exists and indicates healthy
    expect(getByText(/Dependencies/i)).toBeInTheDocument();
    expect(getByText(/Redis/i)).toBeInTheDocument();
    expect(getByText(/HEALTHY/i)).toBeInTheDocument();
  });

  test("redis status shows DOWN when redis.ok=false", () => {
    // Arrange: redis down => chip label should show DOWN
    const preloadedState = mkState({
      system: { health: { redis: { ok: false } } },
    });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert
    expect(getByText(/^DOWN$/i)).toBeInTheDocument();
  });

  test("hit rate is computed when hits/misses exist", () => {
    // Arrange: hits=8, misses=2 => 80% hit rate
    const preloadedState = mkState({
      system: { health: { redis: { ok: true, hits: 8, misses: 2 } } },
    });

    const { getByText } = renderWithStore(<HealthView />, {
      preloadedState,
      reducer: { system: (state = preloadedState.system) => state },
    });

    // Assert: "80%" and hits count are displayed
    expect(getByText(/80%/i)).toBeInTheDocument();
    expect(getByText(/hits\s*8/i)).toBeInTheDocument();
  });
});
