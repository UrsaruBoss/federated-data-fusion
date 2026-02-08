// src/layouts/AppLayout.jsx
/* ===============================
    Main layout component that includes the top navigation bar and defines the overall structure of the application
================================ */

import { Outlet, useLocation, Link } from "react-router-dom";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Snackbar,
  Alert as MuiAlert,
  Button,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  CircularProgress,
} from "@mui/material";

// Icons (visual language for navigation + admin controls)
import PublicIcon from "@mui/icons-material/Public";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";

import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TuneIcon from "@mui/icons-material/Tune";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";

// App bootstrap: starts global data syncing + health polling into Redux
import { startDataLayer } from "../store/bootstrap";

// API client helpers (your lightweight fetch wrappers)
import { getJson, postJson } from "../api/client";

/**
 * Available simulation scenarios.
 * `key` is what backend expects, `label` is the UI display.
 */
const SCENARIOS = [
  { key: "normal", label: "NORMAL" },
  { key: "stress", label: "STRESS" },
  { key: "incident", label: "INCIDENT" },
];

export default function AppLayout() {
  const dispatch = useDispatch();
  const location = useLocation();

  /**
   * Redux state read (global system status)
   * - health: API health endpoint status, used for chip display
   * - source: "cache" vs "live" to indicate data origin
   */
  const health = useSelector((s) => s.system.health);
  const source = useSelector((s) => s.system.source);

  // ---- local time display (browser clock)
  const [localTime, setLocalTime] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    // Tick every second for the top-right clock
    const t = setInterval(() => setLocalTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- ADMIN state (fetched from backend)
  // Example contents: { scenario, cooldown_remaining, rates, ... }
  const [admin, setAdmin] = useState(null);

  /**
   * One global "busy" state for admin operations.
   * The separate label makes UX nicer: "Applying STRESS…" / "Resetting…"
   */
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");

  // Scenario menu anchor (MUI Menu uses anchor element)
  const [scenarioAnchor, setScenarioAnchor] = useState(null);
  const menuOpen = Boolean(scenarioAnchor);

  // Reset confirmation modal open/close
  const [resetOpen, setResetOpen] = useState(false);

  /**
   * Tooltips are controlled manually to avoid MUI warnings
   * when a tooltip tries to remain open while menus/dialogs open.
   */
  const [scenarioTipOpen, setScenarioTipOpen] = useState(false);
  const [resetTipOpen, setResetTipOpen] = useState(false);

  // Toast notification state (success/error snackbars)
  const [toast, setToast] = useState(null);
  const closeToast = () => setToast(null);

  /**
   * Operation ID tracking to prevent race conditions:
   * If two async ops overlap, only the latest is allowed to close the busy state.
   */
  const opRef = useRef(0);
  const beginOp = (label) => {
    const id = ++opRef.current;
    setBusy(true);
    setBusyLabel(label);
    return id;
  };
  const endOp = (id) => {
    // Close only if this is still the latest operation
    if (opRef.current === id) {
      setBusy(false);
      setBusyLabel("");
    }
  };

  /**
   * aliveRef prevents "setState after unmount" warnings.
   * Useful because you poll and also do async fetches.
   */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * Safe setter wrapper for admin updates (only runs if component is mounted).
   */
  const safeSetAdmin = (updater) => {
    if (!aliveRef.current) return;
    setAdmin(updater);
  };

  /**
   * Fetch current admin state from backend.
   * Used initially and also on a polling interval.
   */
  const pullAdminState = useCallback(async () => {
    try {
      const s = await getJson("/api/admin/state");
      if (!aliveRef.current) return;
      setAdmin(s);
    } catch {
      // Silent errors (demo-grade). In production you might show a tiny warning.
    }
  }, []);

  // ---- initial fetch immediately (so refresh shows correct scenario)
  useEffect(() => {
    pullAdminState();
  }, [pullAdminState]);

  // ---- poll admin state (soft polling)
  useEffect(() => {
    const t = setInterval(pullAdminState, 4000);
    return () => clearInterval(t);
  }, [pullAdminState]);

  /**
   * Local cooldown ticker:
   * Backend returns "cooldown_remaining" (seconds).
   * This interval decreases it smoothly on the client, so the countdown feels real-time.
   */
  useEffect(() => {
    const t = setInterval(() => {
      safeSetAdmin((p) => {
        if (!p) return p;
        const cur = Number(p.cooldown_remaining ?? 0);
        if (!cur || cur <= 0) return p;
        return { ...p, cooldown_remaining: Math.max(0, cur - 1) };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Derived admin values (with defaults)
  const cooldown = Number(admin?.cooldown_remaining ?? 0);
  const scenario = String(admin?.scenario ?? "normal");
  const rates = admin?.rates ?? null;

  // Map scenario key -> label
  const scenarioLabel = SCENARIOS.find((s) => s.key === scenario)?.label ?? "NORMAL";

  // Disable admin controls if we're busy or in cooldown
  const adminDisabled = busy || cooldown > 0;

  /**
   * If menu/dialog opens or busy starts, force-close tooltips.
   * Prevents tooltip layering + avoids MUI "controlled/uncontrolled" warnings.
   */
  useEffect(() => {
    if (menuOpen || resetOpen || busy) {
      setScenarioTipOpen(false);
      setResetTipOpen(false);
    }
  }, [menuOpen, resetOpen, busy]);

  // Tooltips are allowed only when no overlays are active
  const tooltipAllowed = !(menuOpen || resetOpen || busy);

  // Open scenario dropdown menu
  const openScenarioMenu = (e) => {
    setScenarioTipOpen(false);
    setResetTipOpen(false);

    // Remove focus ring from button (optional polish)
    document.activeElement?.blur?.();

    setScenarioAnchor(e.currentTarget);
  };

  // Close scenario menu
  const closeScenarioMenu = () => setScenarioAnchor(null);

  /**
   * Change scenario handler
   * - Optimistic UI: update scenario immediately
   * - Send POST to backend
   * - Apply backend response (scenario, rates, cooldown)
   * - Always end busy state and re-sync via pullAdminState()
   */
  const setScenarioFn = useCallback(
    async (nextScenario) => {
      if (adminDisabled) return;

      closeScenarioMenu();

      // Optimistic update for instant UI feedback
      safeSetAdmin((p) => (p ? { ...p, scenario: nextScenario } : p));

      const opId = beginOp(`Applying ${String(nextScenario).toUpperCase()}…`);

      try {
        const res = await postJson("/api/admin/scenario", { scenario: nextScenario });

        // Merge response into admin state
        safeSetAdmin((p) => ({
          ...(p || {}),
          scenario: String(res?.scenario ?? nextScenario),
          rates: res?.rates ?? p?.rates,
          cooldown_remaining: Number(res?.cooldown_sec ?? 0),
        }));

        setToast({
          kind: "success",
          msg: `Scenario set: ${String(res?.scenario ?? nextScenario).toUpperCase()}`,
        });
      } catch {
        setToast({ kind: "error", msg: "Failed to change scenario (cooldown/busy)." });
      } finally {
        endOp(opId);        // ✅ Always close busy for this operation
        pullAdminState();   // ✅ Re-sync from server to avoid drift
      }
    },
    [adminDisabled, pullAdminState]
  );

  /**
   * Reset simulation handler
   * - Opens busy modal
   * - POST reset
   * - Shows toast with count of cleared events
   * - Applies cooldown if returned
   * - Always closes busy + modal + re-sync
   */
  const doReset = useCallback(async () => {
    if (adminDisabled) return;

    const opId = beginOp("Resetting simulation…");

    try {
      const res = await postJson("/api/admin/reset", {});

      setToast({
        kind: "success",
        msg: `Simulation reset (${res?.deleted?.events ?? 0} events cleared)`,
      });

      // Apply cooldown immediately if backend provides it
      if (res?.cooldown_sec != null) {
        safeSetAdmin((p) => (p ? { ...p, cooldown_remaining: Number(res.cooldown_sec) } : p));
      }
    } catch {
      setToast({ kind: "error", msg: "Reset failed (cooldown/busy)." });
    } finally {
      endOp(opId);        // ✅ Always close busy for this operation
      setResetOpen(false);
      pullAdminState();   // ✅ Re-sync from server
    }
  }, [adminDisabled, pullAdminState]);

  /**
   * Start global data layer once:
   * - streaming/polling for ops data
   * - periodic health checks
   * Returns a stop function for cleanup on unmount
   */
  useEffect(() => {
    const stop = startDataLayer(dispatch, {
      fullSyncTtlMs: 90_000,
      fullSyncIntervalMs: 120_000,
      healthIntervalMs: 3_000,
    });
    return () => stop();
  }, [dispatch]);

  /**
   * Title changes based on route.
   * Memoized to avoid recomputing each render.
   */
  const title = useMemo(() => {
    if (location.pathname === "/ops") return "Operations View";
    if (location.pathname === "/wall") return "Command Wall";
    if (location.pathname === "/health") return "System Health";
    return "Federated Data Fusion";
  }, [location.pathname]);

  /**
   * Compute health chip label + color.
   */
  const healthChip = (() => {
    if (!health) return { label: "API …", color: "default" };
    if (health.ok) return { label: "API OK", color: "success" };
    return { label: "API DEGRADED", color: "error" };
  })();

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#0b1118" }}>
      {/* TOP BAR */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: "rgba(11,17,24,0.86)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          {/* LEFT: Brand + Navigation */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PublicIcon sx={{ opacity: 0.85 }} />
              <Typography sx={{ fontWeight: 950, letterSpacing: 0.8 }}>
                FDF • COMMAND
              </Typography>
            </Box>

            {/* Nav pills */}
            <Box
              sx={{
                display: "flex",
                gap: 0.5,
                p: 0.5,
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <NavPill to="/ops" label="OPS" icon={<DashboardIcon fontSize="small" />} />
              <NavPill to="/wall" label="WALL" icon={<ViewModuleIcon fontSize="small" />} />
              <NavPill to="/health" label="HEALTH" icon={<MonitorHeartIcon fontSize="small" />} />
            </Box>
          </Box>

          {/* CENTER: Current view title (hidden on mobile) */}
          <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 1 }}>
            <WifiTetheringIcon sx={{ opacity: 0.65 }} fontSize="small" />
            <Typography sx={{ opacity: 0.8, fontWeight: 700, letterSpacing: 0.3 }}>
              {title}
            </Typography>
          </Box>

          {/* RIGHT: Admin controls + status chips */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            {/* ADMIN pill */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                p: 0.5,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <AdminPanelSettingsIcon fontSize="small" sx={{ opacity: 0.7, ml: 0.25 }} />

              {/* Scenario selector button */}
              <Tooltip
                title={cooldown > 0 ? `Cooldown: ${cooldown}s` : "Simulation controls"}
                open={tooltipAllowed && scenarioTipOpen}
                onOpen={() => tooltipAllowed && setScenarioTipOpen(true)}
                onClose={() => setScenarioTipOpen(false)}
                enterDelay={450}
              >
                {/* Wrap in span so Tooltip works even when Button is disabled */}
                <span>
                  <Button
                    onClick={openScenarioMenu}
                    disabled={adminDisabled}
                    aria-label="scenario-menu"
                    endIcon={<TuneIcon fontSize="small" />}
                    sx={{
                      height: 34,
                      px: 1.25,
                      borderRadius: 999,
                      textTransform: "none",
                      fontWeight: 900,
                      letterSpacing: 0.4,
                      color: "rgba(255,255,255,0.92)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.02)",
                      "&:hover": { background: "rgba(255,255,255,0.06)" },
                    }}
                  >
                    {scenarioLabel}
                    {/* Cooldown countdown displayed inside the button */}
                    {cooldown > 0 ? (
                      <Typography
                        component="span"
                        className="mono"
                        sx={{ ml: 1, opacity: 0.75, fontWeight: 900, fontSize: 12 }}
                      >
                        {cooldown}s
                      </Typography>
                    ) : null}
                  </Button>
                </span>
              </Tooltip>

              {/* Scenario dropdown menu */}
              <Menu
                anchorEl={scenarioAnchor}
                open={menuOpen}
                onClose={closeScenarioMenu}
                disableScrollLock
                PaperProps={{
                  sx: {
                    mt: 1,
                    borderRadius: 2,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(18,24,33,0.98)",
                    backdropFilter: "blur(10px)",
                    minWidth: 180,
                  },
                }}
              >
                {SCENARIOS.map((s) => (
                  <MenuItem
                    key={s.key}
                    disabled={adminDisabled}
                    selected={scenario === s.key}
                    onClick={() => setScenarioFn(s.key)}
                    sx={{ fontWeight: 900, letterSpacing: 0.4 }}
                  >
                    {s.label}
                  </MenuItem>
                ))}
              </Menu>

              {/* Reset button (opens confirmation dialog) */}
              <Tooltip
                title={adminDisabled ? `Reset disabled (${cooldown}s)` : "Reset simulation"}
                open={tooltipAllowed && resetTipOpen}
                onOpen={() => tooltipAllowed && setResetTipOpen(true)}
                onClose={() => setResetTipOpen(false)}
                enterDelay={450}
              >
                <span>
                  <IconButton
                    size="small"
                    aria-label="reset-simulation"
                    onClick={() => {
                      setResetTipOpen(false);
                      setScenarioTipOpen(false);
                      setResetOpen(true);
                    }}
                    disabled={adminDisabled}
                    sx={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 999,
                      color: "rgba(255,255,255,0.85)",
                      background: "rgba(255,255,255,0.02)",
                      "&:hover": { background: "rgba(255,255,255,0.06)" },
                      width: 34,
                      height: 34,
                    }}
                  >
                    <RestartAltIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            {/* API health indicator */}
            <Chip size="small" label={healthChip.label} color={healthChip.color} variant="outlined" />

            {/* Clock */}
            <Typography className="mono" sx={{ opacity: 0.85, minWidth: 96, textAlign: "right" }}>
              {localTime}
            </Typography>

            {/* Data source indicator (cache vs live) */}
            <Tooltip title={`Data source: ${source}`}>
              <Chip
                size="small"
                label={source === "cache" ? "CACHED" : "LIVE"}
                variant="outlined"
                sx={{
                  borderColor: "rgba(61,169,252,0.35)",
                  color: "rgba(230,237,243,0.9)",
                  background: "rgba(61,169,252,0.08)",
                  fontWeight: 800,
                  letterSpacing: 0.4,
                }}
              />
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Main content rendered by nested routes */}
      <Box sx={{ p: 2 }}>
        <Outlet />
      </Box>

      {/* RESET CONFIRM MODAL */}
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(18,24,33,0.96)",
            backdropFilter: "blur(12px)",
            color: "rgba(255,255,255,0.92)",
            minWidth: { xs: "92vw", sm: 560 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 950, letterSpacing: 0.3 }}>
          Reset simulation?
        </DialogTitle>

        <DialogContent sx={{ pt: 0 }}>
          <Typography sx={{ opacity: 0.8, mt: 0.5 }}>
            This clears events/alerts and reboots the synthetic fleet. All clients will see the reset.
          </Typography>

          <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

          {/* Quick summary of current admin status */}
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              Current scenario: <span className="mono">{scenarioLabel}</span>
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              Cooldown: <span className="mono">{cooldown > 0 ? `${cooldown}s` : "none"}</span>
            </Typography>
            {rates ? (
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                Rates:{" "}
                <span className="mono">
                  event {rates.event}s / asset {rates.asset}s / alert {rates.alert}s
                </span>
              </Typography>
            ) : null}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 1.5 }}>
          <Button
            onClick={() => setResetOpen(false)}
            sx={{
              borderRadius: 999,
              fontWeight: 900,
              color: "rgba(255,255,255,0.82)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Cancel
          </Button>

          <Button
            onClick={doReset}
            disabled={adminDisabled}
            variant="contained"
            sx={{
              borderRadius: 999,
              fontWeight: 950,
              px: 2.2,
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      {/* BUSY / PROCESSING DIALOG */}
      <Dialog
        open={busy}
        PaperProps={{
          sx: {
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(18,24,33,0.96)",
            backdropFilter: "blur(12px)",
            color: "rgba(255,255,255,0.92)",
            minWidth: { xs: "92vw", sm: 520 },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 950, letterSpacing: 0.3 }}>
          Processing…
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
            <CircularProgress size={22} />
            <Typography sx={{ opacity: 0.85, fontWeight: 800 }}>
              {busyLabel || "Working…"}
            </Typography>
          </Box>

          <Typography variant="caption" sx={{ display: "block", mt: 1.5, opacity: 0.65 }}>
            Scenario: <span className="mono">{scenarioLabel}</span>{" "}
            {cooldown > 0 ? <>• Cooldown <span className="mono">{cooldown}s</span></> : null}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1.5 }}>
          <Button
            disabled
            sx={{
              borderRadius: 999,
              fontWeight: 900,
              color: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            Please wait
          </Button>
        </DialogActions>
      </Dialog>

      {/* TOAST NOTIFICATIONS */}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2600}
        onClose={closeToast}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <MuiAlert
            onClose={closeToast}
            severity={toast.kind}
            variant="filled"
            sx={{ fontWeight: 800 }}
          >
            {toast.msg}
          </MuiAlert>
        ) : null}
      </Snackbar>
    </Box>
  );
}

/**
 * NavPill
 * -------
 * A small pill-like link that highlights the active route.
 * Uses Typography as Link for consistent styling.
 */
function NavPill({ to, label, icon }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <Typography
      component={Link}
      to={to}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.7,
        borderRadius: 1.5,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.5,
        textDecoration: "none",
        userSelect: "none",
        color: active ? "white" : "rgba(255,255,255,0.62)",
        background: active ? "rgba(255,255,255,0.10)" : "transparent",
        border: "1px solid rgba(255,255,255,0.10)",
        "&:hover": {
          background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
        },
      }}
    >
      <Box sx={{ opacity: active ? 0.95 : 0.75, display: "flex", alignItems: "center" }}>
        {icon}
      </Box>
      {label}
    </Typography>
  );
}
