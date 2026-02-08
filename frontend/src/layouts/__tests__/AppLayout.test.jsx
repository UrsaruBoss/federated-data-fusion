// src/layouts/__tests__/AppLayout.test.jsx
import React from "react";
import AppLayout from "../AppLayout";
import { renderWithStore } from "../../utils/test-utils";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, waitFor, act, screen } from "@testing-library/react";
import { getJson, postJson } from "../../api/client";

// --------------------
// Mocks
// --------------------

/**
 * Mock API client so no real HTTP requests are made.
 * We explicitly control resolved values per test.
 */
jest.mock("../../api/client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

/**
 * Mock the data layer bootstrap.
 * startDataLayer normally starts intervals + SSE;
 * in tests we only care that it doesn’t crash and returns a stop() function.
 */
jest.mock("../../store/bootstrap", () => ({
  startDataLayer: () => jest.fn(), // returns stop()
}));

/**
 * Mock <Outlet /> because AppLayout routing logic
 * is not under test here.
 */
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  Outlet: () => <div data-testid="outlet" />,
}));

/**
 * mkState
 * -------
 * Minimal Redux state shape required by AppLayout.
 * Tests can override `system` fields as needed.
 */
function mkState(partial = {}) {
  return {
    system: {
      health: { ok: true },
      source: "live",
      ...partial.system,
    },
  };
}

/**
 * renderLayout
 * ------------
 * Helper to render AppLayout inside a MemoryRouter
 * with a given initial route and Redux state.
 */
function renderLayout({ preloadedState, path = "/ops" } = {}) {
  return renderWithStore(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout />
    </MemoryRouter>,
    {
      preloadedState,
      reducer: {
        system: (s = preloadedState.system) => s,
      },
    }
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    /**
     * Default admin state returned on mount.
     * AppLayout pulls `/api/admin/state` immediately.
     */
    getJson.mockResolvedValue({
      scenario: "normal",
      cooldown_remaining: 0,
      rates: null,
    });
  });

  afterEach(() => {
    // Ensure timers are fully flushed and restored
    act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  test("renders brand + nav pills + outlet", async () => {
    const preloadedState = mkState();

    const { getByText, getByTestId } = renderLayout({
      preloadedState,
      path: "/ops",
    });

    // Brand + navigation
    expect(getByText(/FDF • COMMAND/i)).toBeInTheDocument();
    expect(getByText("OPS")).toBeInTheDocument();
    expect(getByText("WALL")).toBeInTheDocument();
    expect(getByText("HEALTH")).toBeInTheDocument();

    // Routed content placeholder
    expect(getByTestId("outlet")).toBeInTheDocument();

    // Admin state is fetched on mount
    await waitFor(() =>
      expect(getJson).toHaveBeenCalledWith("/api/admin/state")
    );
  });

  test("shows title based on route", async () => {
    const preloadedState = mkState();

    const { getByText } = renderWithStore(
      <MemoryRouter initialEntries={["/health"]}>
        <AppLayout />
      </MemoryRouter>,
      {
        preloadedState,
        reducer: { system: (s = preloadedState.system) => s },
      }
    );

    // Route-aware title
    expect(getByText(/System Health/i)).toBeInTheDocument();
  });

  test("shows API OK when health.ok=true and DEGRADED when false", () => {
    const okState = mkState({ system: { health: { ok: true } } });
    const badState = mkState({ system: { health: { ok: false } } });

    const r1 = renderLayout({ preloadedState: okState });
    expect(r1.getByText(/API OK/i)).toBeInTheDocument();

    r1.unmount();

    const r2 = renderLayout({ preloadedState: badState });
    expect(r2.getByText(/API DEGRADED/i)).toBeInTheDocument();
  });

  test("shows LIVE/CACHED source chip", () => {
    const liveState = mkState({ system: { source: "live" } });
    const cacheState = mkState({ system: { source: "cache" } });

    const r1 = renderLayout({ preloadedState: liveState });
    expect(r1.getByText("LIVE")).toBeInTheDocument();
    r1.unmount();

    const r2 = renderLayout({ preloadedState: cacheState });
    expect(r2.getByText("CACHED")).toBeInTheDocument();
  });

  test("scenario menu opens and selecting scenario calls POST", async () => {
    const preloadedState = mkState();

    /**
     * Simulate switching scenario to STRESS.
     * Backend responds with cooldown and new rates.
     */
    postJson.mockResolvedValue({
      scenario: "stress",
      cooldown_sec: 5,
      rates: { event: 2, asset: 3, alert: 4 },
    });

    const { getByLabelText, getByText, queryByText } =
      renderLayout({ preloadedState });

    // Wait for initial admin pull (NORMAL)
    await waitFor(() => expect(getJson).toHaveBeenCalled());

    // Open scenario menu
    fireEvent.click(getByLabelText("scenario-menu"));
    expect(getByText("STRESS")).toBeInTheDocument();

    // Select STRESS
    fireEvent.click(getByText("STRESS"));

    // POST request sent
    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/api/admin/scenario", {
        scenario: "stress",
      });
    });

    // Busy dialog shown during async operation
    expect(getByText(/Processing/i)).toBeInTheDocument();

    // Busy dialog closes once operation finishes
    await waitFor(() => {
      expect(queryByText(/Processing/i)).toBeNull();
    });

    // Scenario label updates
    expect(getByText(/STRESS/i)).toBeInTheDocument();
  });

  test("reset flow: opens confirm dialog, calls reset API, closes dialog", async () => {
    const preloadedState = mkState();

    postJson.mockResolvedValue({
      deleted: { events: 12 },
      cooldown_sec: 3,
    });

    const { getByLabelText, getByText, queryByText } =
      renderLayout({ preloadedState });

    await waitFor(() => expect(getJson).toHaveBeenCalled());

    // Open reset confirmation
    fireEvent.click(getByLabelText("reset-simulation"));
    expect(getByText(/Reset simulation\?/i)).toBeInTheDocument();

    // Confirm reset
    fireEvent.click(getByText("Reset"));

    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/api/admin/reset", {});
    });

    // Busy dialog visible while resetting
    expect(getByText(/Processing/i)).toBeInTheDocument();

    // Confirmation dialog closes after completion
    await waitFor(() => {
      expect(queryByText(/Reset simulation\?/i)).toBeNull();
    });
  });

  test("cooldown disables controls and shows countdown in scenario button", async () => {
    /**
     * IMPORTANT:
     * AppLayout polls `/api/admin/state` on an interval.
     * We must return a stable cooldown value so it doesn’t reset
     * between calls during the test.
     */
    getJson.mockResolvedValue({
      scenario: "normal",
      cooldown_remaining: 7,
      rates: null,
    });

    const preloadedState = mkState();
    renderLayout({ preloadedState });

    // Wait until scenario button exists
    const scenarioBtn = await screen.findByLabelText("scenario-menu");

    // Wait until cooldown text appears
    await waitFor(() => {
      expect(scenarioBtn).toHaveTextContent(/7s/i);
    });

    // Controls should be disabled during cooldown
    expect(scenarioBtn).toBeDisabled();
    expect(screen.getByLabelText("reset-simulation")).toBeDisabled();
  });
});
