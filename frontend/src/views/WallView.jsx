// src/views/WallView.jsx
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Box, Typography } from "@mui/material";

import PublicIcon from "@mui/icons-material/Public";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SensorsIcon from "@mui/icons-material/Sensors";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";

import Map2D from "../components/Map2D";

/**
 * WallView
 * --------
 * Full-screen "command wall" layout:
 * - Header (title + UTC clock + mini counts)
 * - Map (flex row, must use minHeight: 0 to allow proper shrinking)
 * - KPI bar (3 blocks)
 * - Ticker (P1 alert feed)
 *
 * Layout notes:
 * - Uses CSS grid with fixed + flexible rows.
 * - The map row uses `minmax(0, 1fr)` to prevent overflow issues in nested flex/grid.
 */
export default function WallView() {
  // Live domain datasets from Redux
  const events = useSelector((s) => s.events.items) ?? [];
  const alerts = useSelector((s) => s.alerts.items) ?? [];
  const assets = useSelector((s) => s.assets.items) ?? [];

  // UTC clock updated once per second (for "command wall" feel)
  const utc = useUtcClock();

  // KPI aggregation (memoized to avoid recalculations on unrelated renders)
  const kpi = useMemo(() => buildKpi({ assets, alerts, events }), [assets, alerts, events]);

  return (
    <Box sx={S.root}>
      {/* HEADER: Title + UTC + counts */}
      <Header utc={utc} assets={assets} events={events} alerts={alerts} />

      {/* MAP: Must be allowed to shrink within grid row (minHeight: 0) */}
      <Box sx={S.mapPad}>
        <Box sx={S.mapCard}>
          {/* Map2D is configured to fill the available height */}
          <Map2D events={events} assets={assets} height="100%" />
        </Box>
      </Box>

      {/* KPI BAR: Compact, large-font summary */}
      <KpiBar assets={assets} alerts={alerts} events={events} kpi={kpi} />

      {/* TICKER: Shows top P1 alerts or idle state */}
      <Ticker p1List={kpi.p1List} />
    </Box>
  );
}

/* -----------------------------
 * Hooks
 * ----------------------------- */

/**
 * useUtcClock
 * -----------
 * Keeps a HH:MM:SS UTC clock ticking every second.
 * Returns a string like "16:12:09".
 */
function useUtcClock() {
  const [utc, setUtc] = useState(() => getUtcHHMMSS());
  useEffect(() => {
    const t = setInterval(() => setUtc(getUtcHHMMSS()), 1000);
    return () => clearInterval(t);
  }, []);
  return utc;
}

/**
 * getUtcHHMMSS
 * ------------
 * Extracts HH:MM:SS from Date().toUTCString().
 * Example:
 *   "Sat, 07 Feb 2026 16:12:09 GMT" -> slice(17,25) => "16:12:09"
 */
function getUtcHHMMSS() {
  return new Date().toUTCString().slice(17, 25);
}

/* -----------------------------
 * KPI logic
 * ----------------------------- */

/**
 * buildKpi
 * --------
 * Computes a small operational summary:
 * - Assets: degraded/offline counts
 * - Alerts: top P1 list (limited) and P2 count
 * - Events: critical/high counts
 *
 * Returns:
 * { degraded, offline, p1List, p2, critical, high }
 */
function buildKpi({ assets, alerts, events }) {
  const degraded = assets.reduce((n, a) => n + (a?.status === "degraded" ? 1 : 0), 0);
  const offline = assets.reduce((n, a) => n + (a?.status === "offline" ? 1 : 0), 0);

  // Only show a couple of P1 alerts in the ticker for readability
  const p1List = alerts.filter((a) => a?.priority === "p1").slice(0, 2);
  const p2 = alerts.reduce((n, a) => n + (a?.priority === "p2" ? 1 : 0), 0);

  const critical = events.reduce((n, e) => n + (e?.severity === "critical" ? 1 : 0), 0);
  const high = events.reduce((n, e) => n + (e?.severity === "high" ? 1 : 0), 0);

  return { degraded, offline, p1List, p2, critical, high };
}

/* -----------------------------
 * UI: Header / KPI / Ticker
 * ----------------------------- */

/**
 * Header
 * ------
 * Top row for the wall:
 * - Left: icon + title + UTC clock
 * - Right: compact entity counts
 */
function Header({ utc, assets, events, alerts }) {
  return (
    <Box sx={S.header} data-testid="wall-header">
      <Box sx={S.headerLeft}>
        <PublicIcon sx={{ opacity: 0.8 }} />
        <Box>
          <Typography sx={S.title}>SITUATIONAL AWARENESS</Typography>
          <Typography className="mono" sx={S.subtitle}>
            UTC {utc}
          </Typography>
        </Box>
      </Box>

      <Box sx={S.headerRight}>
        <MiniStat label="ASSETS" value={assets.length} />
        <MiniStat label="EVENTS" value={events.length} />
        <MiniStat label="ALERTS" value={alerts.length} accent="error" />
      </Box>
    </Box>
  );
}

/**
 * KpiBar
 * ------
 * Three KPI blocks:
 * - Assets (total + degraded/offline)
 * - Alerts (P1 + P2 + total)
 * - Events (critical + high + total)
 */
function KpiBar({ assets, alerts, events, kpi }) {
  return (
    <Box sx={S.kpiBar}>
      <KpiBlock
        title="ASSETS"
        icon={<Inventory2Icon />}
        main={assets.length}
        lines={[`DEGRADED: ${kpi.degraded}`, `OFFLINE: ${kpi.offline}`]}
      />

      <KpiBlock
        title="ALERTS"
        icon={<WarningAmberIcon />}
        main={`P1: ${kpi.p1List.length}`}
        lines={[`P2: ${kpi.p2}`, `TOTAL: ${alerts.length}`]}
        accent="error"
        borderLeft
      />

      <KpiBlock
        title="EVENTS"
        icon={<SensorsIcon />}
        main={`CRIT: ${kpi.critical}`}
        lines={[`HIGH: ${kpi.high}`, `TOTAL: ${events.length}`]}
        accent="warning"
        borderLeft
      />
    </Box>
  );
}

/**
 * Ticker
 * ------
 * Bottom strip showing the most urgent P1 alerts.
 * If no P1 alerts exist, displays an idle message.
 *
 * Note: The key fallback uses Math.random(), which can cause remount flicker
 * if alert_id is missing. Ideally each alert should have a stable ID.
 */
function Ticker({ p1List }) {
  const hasP1 = p1List?.length > 0;

  return (
    <Box sx={S.ticker}>
      {hasP1 ? (
        p1List.map((a) => (
          <Box key={a.alert_id ?? a.id ?? `${a.message}-${Math.random()}`} sx={S.tickerRow}>
            <ReportProblemIcon sx={S.tickerIconHot} />
            <Typography sx={S.tickerTextHot}>P1 • {a.message}</Typography>
          </Box>
        ))
      ) : (
        <Box sx={S.tickerRow}>
          <ReportProblemIcon sx={S.tickerIconIdle} />
          <Typography sx={S.tickerTextIdle}>No critical alerts</Typography>
        </Box>
      )}
    </Box>
  );
}

/* -----------------------------
 * Small components
 * ----------------------------- */

/**
 * KpiBlock
 * --------
 * A single KPI tile inside the KPI bar.
 * Supports optional `accent` (error/warning) and a left border divider.
 */
function KpiBlock({ title, icon, main, lines = [], accent, borderLeft }) {
  const color =
    accent === "error"
      ? TOKENS.accentError
      : accent === "warning"
      ? TOKENS.accentWarn
      : TOKENS.textStrong;

  return (
    <Box sx={{ ...S.kpiBlock, ...(borderLeft ? S.kpiBorderLeft : null) }}>
      <Box sx={S.kpiHeader}>
        <Box sx={S.kpiIcon}>{icon}</Box>
        <Typography sx={S.kpiTitle}>{title}</Typography>
      </Box>

      <Typography sx={{ ...S.kpiMain, color }}>{main}</Typography>

      {lines.map((l, i) => (
        <Typography key={i} sx={S.kpiLine}>
          {l}
        </Typography>
      ))}
    </Box>
  );
}

/**
 * MiniStat
 * --------
 * Small numeric stats used in the header right side.
 */
function MiniStat({ label, value, accent }) {
  const color = accent === "error" ? TOKENS.accentError : TOKENS.textStrong;

  return (
    <Box sx={{ textAlign: "right" }}>
      <Typography sx={S.miniLabel}>{label}</Typography>
      <Typography sx={{ ...S.miniValue, color }}>{value}</Typography>
    </Box>
  );
}

/* -----------------------------
 * Styling tokens
 * ----------------------------- */

/**
 * TOKENS
 * ------
 * Centralized color and surface tokens for consistent look.
 */
const TOKENS = {
  bgBase: "#0b1118",
  panel: "rgba(15,22,32,0.88)",
  panelSoft: "rgba(15,22,32,0.35)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.08)",
  textStrong: "rgba(255,255,255,0.95)",
  textDim: "rgba(255,255,255,0.75)",
  textFaint: "rgba(255,255,255,0.65)",
  accentError: "rgba(231,76,60,0.95)",
  accentWarn: "rgba(243,156,18,0.95)",
};

/**
 * S
 * -
 * SX style objects used across the WallView layout.
 */
const S = {
  root: {
    height: "calc(100dvh - 64px)", // below TopBar
    overflow: "hidden",            // prevents bleed/scrollbars
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto 72px", // header | map | kpi | ticker
    minHeight: 0,
    background:
      "radial-gradient(1200px 600px at 50% -220px, rgba(61,169,252,0.14), transparent 60%), " +
      TOKENS.bgBase,
  },

  header: {
    px: 4,
    py: 2,
    borderBottom: TOKENS.border,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 1.25 },
  headerRight: { display: "flex", gap: 3, alignItems: "center" },

  title: { fontSize: 26, fontWeight: 950, letterSpacing: 1 },
  subtitle: { opacity: 0.65 },

  // Map container row must allow shrinking within grid
  mapPad: { p: 2, minHeight: 0, overflow: "hidden" },
  mapCard: {
    height: "100%",
    minHeight: 0,
    borderRadius: 2,
    overflow: "hidden",
    border: TOKENS.border,
    background: TOKENS.panelSoft,
  },

  kpiBar: {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
    borderTop: TOKENS.border,
    background: TOKENS.panel,
    minHeight: 0,
    overflow: "hidden",
  },

  kpiBlock: {
    px: 4,
    py: 2,
    minWidth: 0,
    display: "grid",
    alignContent: "center",
    gap: 0.35,
  },
  kpiBorderLeft: { borderLeft: "1px solid rgba(255,255,255,0.08)" },
  kpiHeader: { display: "flex", alignItems: "center", gap: 1, opacity: 0.82 },
  kpiIcon: { display: "flex", alignItems: "center" },
  kpiTitle: { letterSpacing: 1, fontWeight: 800 },
  kpiMain: { fontSize: 44, fontWeight: 950, lineHeight: 1.05 },
  kpiLine: { opacity: 0.75 },

  ticker: {
    px: 4,
    py: 1,
    background: "rgba(231,76,60,0.18)",
    borderTop: "2px solid rgba(231,76,60,0.85)",
    display: "grid",
    alignContent: "center",
    gap: 0.5,
    overflow: "hidden",
  },

  tickerRow: { display: "flex", alignItems: "center", gap: 1 },
  tickerIconHot: { color: "rgba(231,76,60,0.95)" },
  tickerIconIdle: { opacity: 0.35 },
  tickerTextHot: { fontSize: 18, fontWeight: 850, letterSpacing: 0.3 },
  tickerTextIdle: { fontSize: 18, opacity: 0.75 },

  miniLabel: { opacity: 0.6, letterSpacing: 1, fontSize: 11, fontWeight: 800 },
  miniValue: { fontSize: 18, fontWeight: 950 },
};
