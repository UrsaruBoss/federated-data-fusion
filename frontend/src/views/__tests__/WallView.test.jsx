// src/views/__tests__/WallView.test.jsx
import React from "react";
import WallView from "../WallView";
import { renderWithStore } from "../../utils/test-utils";
import { within } from "@testing-library/react";

/**
 * Mock Map2D so we don’t test Leaflet / map rendering here.
 * WallView tests focus on:
 * - layout + KPIs + ticker logic
 * - correct rendering of derived values
 */
jest.mock("../../components/Map2D", () => () => <div data-testid="map2d" />);

/**
 * mkState
 * -------
 * Provides the minimal Redux shape WallView expects:
 * - events.items
 * - alerts.items
 * - assets.items
 *
 * Each test can override just what it needs using `partial`.
 */
function mkState(partial = {}) {
  return {
    events: { items: [] },
    alerts: { items: [] },
    assets: { items: [] },
    ...partial,
  };
}

describe("WallView", () => {
  test("renders header + map placeholder", () => {
    // Arrange: empty state is enough to render the WallView skeleton
    const preloadedState = mkState();

    const { getByText, getByTestId } = renderWithStore(<WallView />, {
      preloadedState,
      // Minimal reducers that return the fixed slice state used in this test
      reducer: {
        events: (s = preloadedState.events) => s,
        alerts: (s = preloadedState.alerts) => s,
        assets: (s = preloadedState.assets) => s,
      },
    });

    // Assert: main title and map placeholder exist
    expect(getByText(/SITUATIONAL AWARENESS/i)).toBeInTheDocument();
    expect(getByTestId("map2d")).toBeInTheDocument();
  });

  test("shows header counts for assets/events/alerts", () => {
    /**
     * This test verifies the header “MiniStat” values:
     * - ASSETS shows number of assets
     * - EVENTS shows number of events
     * - ALERTS shows number of alerts
     *
     * We scope queries using `within(header)` to avoid matching KPI bar text.
     */
    const preloadedState = mkState({
      assets: { items: [{}, {}, {}] },
      events: { items: [{}, {}] },
      alerts: { items: [{}] },
    });

    const { getByTestId } = renderWithStore(<WallView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        alerts: (s = preloadedState.alerts) => s,
        assets: (s = preloadedState.assets) => s,
      },
    });

    // Header has data-testid="wall-header" in WallView.jsx
    const h = within(getByTestId("wall-header"));

    // Assert: labels exist
    expect(h.getByText("ASSETS")).toBeInTheDocument();
    expect(h.getByText("EVENTS")).toBeInTheDocument();
    expect(h.getByText("ALERTS")).toBeInTheDocument();

    // Assert: numeric values exist (3 assets, 2 events, 1 alert)
    expect(h.getByText("3")).toBeInTheDocument();
    expect(h.getByText("2")).toBeInTheDocument();
    expect(h.getByText("1")).toBeInTheDocument();
  });

  test("computes KPI: degraded/offline, P1/P2, CRIT/HIGH", () => {
    /**
     * This test validates KPI computation (buildKpi) through the rendered text.
     *
     * Expectations:
     * - assets: count degraded/offline
     * - alerts: p1List is sliced to top 2, p2 count, total count
     * - events: count critical/high, total count
     */
    const preloadedState = mkState({
      assets: {
        items: [
          { status: "ok" },
          { status: "degraded" },
          { status: "degraded" },
          { status: "offline" },
        ],
      },
      alerts: {
        items: [
          { priority: "p1", message: "A" },
          { priority: "p1", message: "B" },
          { priority: "p2", message: "C" },
          { priority: "p2", message: "D" },
        ],
      },
      events: {
        items: [
          { severity: "critical" },
          { severity: "critical" },
          { severity: "high" },
        ],
      },
    });

    const { getByText } = renderWithStore(<WallView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        alerts: (s = preloadedState.alerts) => s,
        assets: (s = preloadedState.assets) => s,
      },
    });

    // Assets KPI block
    expect(getByText(/DEGRADED:\s*2/i)).toBeInTheDocument();
    expect(getByText(/OFFLINE:\s*1/i)).toBeInTheDocument();

    // Alerts KPI block
    // Note: WallView slices p1List to max 2 entries (so P1: 2)
    expect(getByText(/P1:\s*2/i)).toBeInTheDocument();
    expect(getByText(/P2:\s*2/i)).toBeInTheDocument();
    expect(getByText(/TOTAL:\s*4/i)).toBeInTheDocument();

    // Events KPI block
    expect(getByText(/CRIT:\s*2/i)).toBeInTheDocument();
    expect(getByText(/HIGH:\s*1/i)).toBeInTheDocument();
    expect(getByText(/TOTAL:\s*3/i)).toBeInTheDocument();
  });

  test("ticker shows top 2 P1 messages when present", () => {
    /**
     * The ticker shows up to the first 2 P1 alerts:
     * - items are filtered by priority === "p1"
     * - then slice(0, 2)
     *
     * So Alpha + Bravo render, Charlie should NOT.
     */
    const preloadedState = mkState({
      alerts: {
        items: [
          { priority: "p1", message: "Alpha" },
          { priority: "p1", message: "Bravo" },
          { priority: "p1", message: "Charlie" }, // should be ignored (slice 0..2)
        ],
      },
    });

    const { queryByText, getByText } = renderWithStore(<WallView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        alerts: (s = preloadedState.alerts) => s,
        assets: (s = preloadedState.assets) => s,
      },
    });

    // Assert: first two show, third one is excluded
    expect(getByText(/P1 • Alpha/i)).toBeInTheDocument();
    expect(getByText(/P1 • Bravo/i)).toBeInTheDocument();
    expect(queryByText(/P1 • Charlie/i)).toBeNull();
  });

  test("ticker shows 'No critical alerts' when no P1", () => {
    /**
     * When there are no P1 alerts, ticker should show the idle message.
     * P2 (and others) should not trigger “hot” ticker mode.
     */
    const preloadedState = mkState({
      alerts: { items: [{ priority: "p2", message: "meh" }] },
    });

    const { getByText } = renderWithStore(<WallView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        alerts: (s = preloadedState.alerts) => s,
        assets: (s = preloadedState.assets) => s,
      },
    });

    expect(getByText(/No critical alerts/i)).toBeInTheDocument();
  });
});
