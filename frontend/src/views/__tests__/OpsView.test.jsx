// src/views/__tests__/OpsView.test.jsx
import React from "react";
import OpsView from "../OpsView";
import { renderWithStore } from "../../utils/test-utils";
import { fireEvent } from "@testing-library/react";

/**
 * Map2D is mocked because:
 * - We are NOT testing Leaflet behavior here
 * - Leaflet requires DOM layout, CSS, and can be flaky in JSDOM
 * - OpsView logic should be testable without map rendering details
 */
jest.mock("../../components/Map2D", () => () => <div data-testid="map2d" />);

/**
 * DataGrid is mocked because:
 * - MUI DataGrid uses virtualization and DOM measurements
 * - Those are slow/flaky in tests and irrelevant for OpsView logic
 *
 * The mock renders a simple list of <button> rows.
 * Clicking a row calls `onRowClick({ row })` to simulate DataGrid behavior.
 */
jest.mock("@mui/x-data-grid", () => ({
  DataGrid: ({ rows = [], onRowClick, getRowId }) => {
    /**
     * Identify which grid is being rendered (events/assets/alerts)
     * based on the shape of the first row. This lets the tests
     * target the right mocked grid via data-testid.
     */
    const type =
      rows?.[0]?.event_id ? "events" :
      rows?.[0]?.asset_id ? "assets" :
      rows?.[0]?.alert_id ? "alerts" :
      "grid";

    return (
      <div data-testid={`datagrid-${type}`}>
        {(rows || []).map((r, idx) => {
          // Use the same ID logic as the real grid: getRowId if provided, else fallback
          const id = getRowId ? getRowId(r) : r.id ?? idx;

          return (
            <button
              key={String(id)}
              type="button"
              onClick={() => onRowClick?.({ row: r })}
            >
              {type}-row-{String(id)}
            </button>
          );
        })}
      </div>
    );
  },
}));

/**
 * mkState
 * -------
 * Builds the minimal Redux state OpsView expects:
 * - events/assets/alerts slices with `items`
 * - health slice with `data` (OpsView uses `s.health?.data`)
 *
 * `partial` lets each test override only the pieces it cares about.
 */
function mkState(partial = {}) {
  return {
    events: { items: [] },
    assets: { items: [] },
    alerts: { items: [] },
    health: { data: null }, // OpsView reads s.health?.data (optional)
    ...partial,
  };
}

describe("OpsView", () => {
  test("renders header + counts chips (and optional health chip)", () => {
    /**
     * This test covers:
     * - Header text renders
     * - Map placeholder renders (Map2D mocked)
     * - Health chip renders only when health.data exists
     * - Count chips show list sizes
     */
    const preloadedState = mkState({
      events: { items: [{ event_id: "e1" }] },
      assets: { items: [{ asset_id: "a1" }, { asset_id: "a2" }] },
      alerts: { items: [{ alert_id: "al1" }, { alert_id: "al2" }, { alert_id: "al3" }] },
      health: { data: { ok: true } },
    });

    const { getByText, getByTestId } = renderWithStore(<OpsView />, {
      preloadedState,
      // Minimal reducers: fixed slices returning the provided state
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    expect(getByText(/Ops Overview/i)).toBeInTheDocument();
    expect(getByTestId("map2d")).toBeInTheDocument();

    // Health chip shows only if health.data exists
    expect(getByText(/API OK/i)).toBeInTheDocument();

    // Count chips reflect array sizes
    expect(getByText(/Events:\s*1/i)).toBeInTheDocument();
    expect(getByText(/Assets:\s*2/i)).toBeInTheDocument();
    expect(getByText(/Alerts:\s*3/i)).toBeInTheDocument();
  });

  test("does not show health chip when health is null", () => {
    // Arrange: health.data null => no API chip should be rendered
    const preloadedState = mkState({
      events: { items: [] },
      assets: { items: [] },
      alerts: { items: [] },
      health: { data: null },
    });

    const { queryByText } = renderWithStore(<OpsView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    // Assert: neither OK nor DEGRADED chip should exist
    expect(queryByText(/API OK/i)).toBeNull();
    expect(queryByText(/API DEGRADED/i)).toBeNull();
  });

  test("computes KPIs for degraded/offline, p1/p2, critical/high", () => {
    /**
     * This test validates that KPI cards derive values correctly from the lists.
     * We don’t need to inspect internal state, just the UI text.
     */
    const preloadedState = mkState({
      assets: {
        items: [
          { asset_id: "a1", status: "ok" },
          { asset_id: "a2", status: "degraded" },
          { asset_id: "a3", status: "offline" },
          { asset_id: "a4", status: "degraded" },
        ],
      },
      alerts: {
        items: [
          { alert_id: "al1", priority: "p1", message: "A" },
          { alert_id: "al2", priority: "p2", message: "B" },
          { alert_id: "al3", priority: "p2", message: "C" },
        ],
      },
      events: {
        items: [
          { event_id: "e1", severity: "critical" },
          { event_id: "e2", severity: "high" },
          { event_id: "e3", severity: "critical" },
        ],
      },
    });

    const { getByText } = renderWithStore(<OpsView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    // Asset KPIs
    expect(getByText(/Degraded:\s*2/i)).toBeInTheDocument();
    expect(getByText(/Offline:\s*1/i)).toBeInTheDocument();

    // Alert KPIs
    expect(getByText(/P1:\s*1/i)).toBeInTheDocument();
    expect(getByText(/P2:\s*2/i)).toBeInTheDocument();

    // Event KPIs
    expect(getByText(/Critical:\s*2/i)).toBeInTheDocument();
    expect(getByText(/High:\s*1/i)).toBeInTheDocument();
  });

  test("selects event when clicking an event row", () => {
    /**
     * OpsView selection behavior:
     * - Clicking an event row sets selectedEventId
     * - It also clears selectedAssetId
     */
    const preloadedState = mkState({
      events: { items: [{ event_id: "e99" }] },
      assets: { items: [] },
      alerts: { items: [] },
    });

    const { getByText } = renderWithStore(<OpsView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    // Before click: no selection
    expect(getByText(/Selected event:\s*—/i)).toBeInTheDocument();

    // Click the mocked row button for event e99
    fireEvent.click(getByText("events-row-e99"));

    // After click: event selected, asset cleared
    expect(getByText(/Selected event:\s*e99/i)).toBeInTheDocument();
    expect(getByText(/Selected asset:\s*—/i)).toBeInTheDocument();
  });

  test("selects asset when clicking an asset row", () => {
    /**
     * Clicking an asset row sets selectedAssetId and clears selectedEventId.
     */
    const preloadedState = mkState({
      events: { items: [] },
      assets: { items: [{ asset_id: "a77" }] },
      alerts: { items: [] },
    });

    const { getByText } = renderWithStore(<OpsView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    expect(getByText(/Selected asset:\s*—/i)).toBeInTheDocument();

    fireEvent.click(getByText("assets-row-a77"));

    expect(getByText(/Selected asset:\s*a77/i)).toBeInTheDocument();
    expect(getByText(/Selected event:\s*—/i)).toBeInTheDocument();
  });

  test("selects related event from an alert row (related_event_id)", () => {
    /**
     * Clicking an alert row should:
     * - If related_event_id exists: select that event and clear asset selection.
     */
    const preloadedState = mkState({
      alerts: { items: [{ alert_id: "al9", related_event_id: "e123" }] },
      events: { items: [] },
      assets: { items: [] },
    });

    const { getByText } = renderWithStore(<OpsView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    fireEvent.click(getByText("alerts-row-al9"));
    expect(getByText(/Selected event:\s*e123/i)).toBeInTheDocument();
  });

  test("selects related asset from an alert row (related_asset_id)", () => {
    /**
     * Clicking an alert row should:
     * - If related_asset_id exists (and related_event_id is missing):
     *   select that asset and clear event selection.
     */
    const preloadedState = mkState({
      alerts: { items: [{ alert_id: "al10", related_asset_id: "a900" }] },
      events: { items: [] },
      assets: { items: [] },
    });

    const { getByText } = renderWithStore(<OpsView />, {
      preloadedState,
      reducer: {
        events: (s = preloadedState.events) => s,
        assets: (s = preloadedState.assets) => s,
        alerts: (s = preloadedState.alerts) => s,
        health: (s = preloadedState.health) => s,
      },
    });

    fireEvent.click(getByText("alerts-row-al10"));
    expect(getByText(/Selected asset:\s*a900/i)).toBeInTheDocument();
  });
});
