// src/views/OpsView.jsx
import { useMemo, useState, useCallback } from "react";
import { useSelector } from "react-redux";

import { Box, Chip, Typography, Card, CardContent, Divider } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

import Map2D from "../components/Map2D";

// Icons for visual hierarchy and quick scanning
import MapIcon from "@mui/icons-material/Map";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SensorsIcon from "@mui/icons-material/Sensors";
import EventIcon from "@mui/icons-material/Event";
import StorageIcon from "@mui/icons-material/Storage";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import ApiIcon from "@mui/icons-material/Api";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

/**
 * OpsView
 * -------
 * Main operational overview page.
 *
 * Responsibilities:
 * - Displays a live 2D situation map (events + assets)
 * - Shows KPI cards (counts by severity/status/priority)
 * - Renders 3 live tables (Events / Assets / Alerts)
 * - Clicking a table row focuses the map (selection + flyTo via Map2D)
 *
 * Data sources:
 * - events/assets/alerts from Redux slices
 * - (optional) API health indicator if present in store
 */
export default function OpsView() {
  // Domain data: kept fresh by the global data layer (full sync + SSE upserts)
  const events = useSelector((s) => s.events.items);
  const assets = useSelector((s) => s.assets.items);
  const alerts = useSelector((s) => s.alerts.items);

  /**
   * Optional: API health from store.
   * NOTE: Your system slice uses `s.system.health`, not `s.health.data`.
   * If you want this chip to work, you likely want:
   *   const health = useSelector((s) => s.system.health);
   *
   * Leaving your original line unchanged (as requested).
   */
  // const health = useSelector((s) => s.system.health);
  const health = useSelector((s) => s.health?.data ?? null);

  // Selected IDs drive:
  // - Map2D focus (flyTo)
  // - marker size emphasis (selected markers are bigger)
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  // -----------------------------
  // Formatters (DataGrid helpers)
  // -----------------------------

  /**
   * Formats an ISO timestamp (or date-like) into a local time string.
   * Returns "-" if the value is missing or invalid.
   */
  const fmtTime = useCallback((v) => {
    if (!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString();
  }, []);

  /**
   * DataGrid `valueFormatter` wrapper:
   * Supports both raw values and formatter params objects.
   */
  const timeFormatter = useCallback(
    (arg) => {
      const value = arg && typeof arg === "object" && "value" in arg ? arg.value : arg;
      return fmtTime(value);
    },
    [fmtTime]
  );

  /**
   * Coordinates formatter:
   * Displays lat/lon with fixed 3 decimals, "-" if invalid.
   */
  const coordFormatter = useCallback((arg) => {
    const value = arg && typeof arg === "object" && "value" in arg ? arg.value : arg;
    const v = parseFloat(value);
    return Number.isNaN(v) ? "-" : v.toFixed(3);
  }, []);

  // -----------------------------
  // KPIs (derived counts)
  // -----------------------------

  /**
   * KPI rollups:
   * - assets by status
   * - alerts by priority
   * - events by severity
   *
   * Memoized to avoid recomputing on unrelated re-renders.
   */
  const kpi = useMemo(() => {
    const degraded = assets.filter((a) => a.status === "degraded").length;
    const offline = assets.filter((a) => a.status === "offline").length;

    const p1 = alerts.filter((a) => a.priority === "p1").length;
    const p2 = alerts.filter((a) => a.priority === "p2").length;

    const critical = events.filter((e) => e.severity === "critical").length;
    const high = events.filter((e) => e.severity === "high").length;

    return { degraded, offline, p1, p2, critical, high };
  }, [assets, alerts, events]);

  // -----------------------------
  // Cell renderers (chips)
  // -----------------------------

  /**
   * Severity chip renderer (events).
   * Maps severity levels to MUI chip colors.
   */
  const severityChip = (v) => {
    const color =
      v === "critical" ? "error" :
      v === "high" ? "warning" :
      v === "medium" ? "info" : "success";
    return <Chip size="small" label={(v ?? "-").toUpperCase()} color={color} variant="outlined" />;
  };

  /**
   * Status chip renderer (assets).
   */
  const statusChip = (v) => {
    const color =
      v === "offline" ? "error" :
      v === "degraded" ? "warning" : "success";
    return <Chip size="small" label={(v ?? "-").toUpperCase()} color={color} variant="outlined" />;
  };

  /**
   * Priority chip renderer (alerts).
   */
  const priorityChip = (v) => {
    const color =
      v === "p1" ? "error" :
      v === "p2" ? "warning" : "info";
    return <Chip size="small" label={(v ?? "-").toUpperCase()} color={color} variant="outlined" />;
  };

  // -----------------------------
  // DataGrid column definitions
  // -----------------------------

  /**
   * Events grid columns.
   * Note: `renderCell` is used for chips; `valueFormatter` for time/coords.
   */
  const eventCols = useMemo(
    () => [
      { field: "created_at", headerName: "Time", flex: 0.9, valueFormatter: timeFormatter },
      { field: "severity", headerName: "Severity", flex: 0.7, renderCell: (p) => severityChip(p.value) },
      { field: "type", headerName: "Type", flex: 0.9 },
      { field: "source", headerName: "Source", flex: 0.9 },
      { field: "confidence", headerName: "Conf", flex: 0.6 },
      { field: "lat", headerName: "Lat", flex: 0.7, valueFormatter: coordFormatter },
      { field: "lon", headerName: "Lon", flex: 0.7, valueFormatter: coordFormatter },
    ],
    [timeFormatter, coordFormatter]
  );

  /**
   * Assets grid columns.
   */
  const assetCols = useMemo(
    () => [
      { field: "name", headerName: "Asset", flex: 1.0 },
      { field: "asset_type", headerName: "Type", flex: 0.8 },
      { field: "status", headerName: "Status", flex: 0.8, renderCell: (p) => statusChip(p.value) },
      { field: "owner_team", headerName: "Team", flex: 0.8 },
      { field: "last_update", headerName: "Updated", flex: 0.9, valueFormatter: timeFormatter },
      { field: "lat", headerName: "Lat", flex: 0.7, valueFormatter: coordFormatter },
      { field: "lon", headerName: "Lon", flex: 0.7, valueFormatter: coordFormatter },
    ],
    [timeFormatter, coordFormatter]
  );

  /**
   * Alerts grid columns.
   */
  const alertCols = useMemo(
    () => [
      { field: "created_at", headerName: "Time", flex: 0.9, valueFormatter: timeFormatter },
      { field: "priority", headerName: "Prio", flex: 0.6, renderCell: (p) => priorityChip(p.value) },
      { field: "message", headerName: "Message", flex: 1.8 },
      { field: "related_event_id", headerName: "Event", flex: 0.9 },
      { field: "related_asset_id", headerName: "Asset", flex: 0.9 },
    ],
    [timeFormatter]
  );

  /**
   * Shared DataGrid styling (dark UI alignment with the rest of the app).
   */
  const gridSx = {
    border: "none",
    "& .MuiDataGrid-columnHeaders": { backgroundColor: "rgba(255,255,255,0.03)" },
    "& .MuiDataGrid-cell": { borderColor: "rgba(255,255,255,0.06)" },
    "& .MuiDataGrid-footerContainer": { borderColor: "rgba(255,255,255,0.06)" },
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {/* Header row: title + live counters */}
      <Card>
        <CardContent sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <SensorsIcon sx={{ opacity: 0.8 }} />
          <Typography variant="h6" sx={{ fontWeight: 900, mr: 1 }}>
            Ops Overview
          </Typography>

          {/* Optional API status chip */}
          {health && (
            <Chip
              icon={health?.ok ? <CheckCircleIcon /> : <ErrorIcon />}
              label={health?.ok ? "API OK" : "API DEGRADED"}
              color={health?.ok ? "success" : "error"}
              size="small"
              variant="outlined"
            />
          )}

          {/* High-level counts */}
          <Chip icon={<EventIcon />} label={`Events: ${events.length}`} size="small" variant="outlined" />
          <Chip icon={<StorageIcon />} label={`Assets: ${assets.length}`} size="small" variant="outlined" />
          <Chip icon={<NotificationsActiveIcon />} label={`Alerts: ${alerts.length}`} size="small" variant="outlined" />

          <Box sx={{ flex: 1 }} />

          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            Live updates via SSE (global)
          </Typography>
        </CardContent>
      </Card>

      {/* Map + KPI cards */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 2 }}>
        {/* Situation map */}
        <Card>
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <MapIcon sx={{ opacity: 0.7 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
                2D Situation Map
              </Typography>
            </Box>

            {/* Map receives live data + current selection */}
            <Map2D
              events={events}
              assets={assets}
              selectedEventId={selectedEventId}
              selectedAssetId={selectedAssetId}
            />

            <Divider sx={{ my: 1.5 }} />

            {/* Selection hints */}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Chip
                size="small"
                variant="outlined"
                label={selectedEventId ? `Selected event: ${selectedEventId}` : "Selected event: —"}
              />
              <Chip
                size="small"
                variant="outlined"
                label={selectedAssetId ? `Selected asset: ${selectedAssetId}` : "Selected asset: —"}
              />
              <Chip size="small" variant="outlined" label="Click a row to focus map" />
            </Box>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <Box sx={{ display: "grid", gap: 2 }}>
          <KpiCard
            title="Assets"
            icon={<Inventory2Icon sx={{ opacity: 0.75 }} />}
            big={assets.length}
            chips={[
              { label: `Degraded: ${kpi.degraded}`, color: kpi.degraded ? "warning" : "default" },
              { label: `Offline: ${kpi.offline}`, color: kpi.offline ? "error" : "default" },
            ]}
          />
          <KpiCard
            title="Alerts"
            icon={<WarningAmberIcon sx={{ opacity: 0.75 }} />}
            big={alerts.length}
            chips={[
              { label: `P1: ${kpi.p1}`, color: kpi.p1 ? "error" : "default" },
              { label: `P2: ${kpi.p2}`, color: kpi.p2 ? "warning" : "default" },
            ]}
          />
          <KpiCard
            title="Events"
            icon={<EventIcon sx={{ opacity: 0.75 }} />}
            big={events.length}
            chips={[
              { label: `Critical: ${kpi.critical}`, color: kpi.critical ? "error" : "default" },
              { label: `High: ${kpi.high}`, color: kpi.high ? "warning" : "default" },
            ]}
          />
        </Box>
      </Box>

      {/* Tables: Events / Assets / Alerts */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr 1fr" }, gap: 2 }}>
        {/* Events table */}
        <Card>
          <CardContent sx={{ pb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <EventIcon sx={{ opacity: 0.7 }} />
              <Typography sx={{ fontWeight: 900 }}>Events (Live)</Typography>
            </Box>

            <Box sx={{ height: 520 }}>
              <DataGrid
                sx={gridSx}
                density="compact"
                rows={events}
                getRowId={(r) => r.event_id}
                columns={eventCols}
                onRowClick={(p) => {
                  // Selecting an event focuses the map and clears asset selection
                  setSelectedEventId(p.row.event_id);
                  setSelectedAssetId(null);
                }}
                pageSizeOptions={[25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
                disableRowSelectionOnClick
              />
            </Box>
          </CardContent>
        </Card>

        {/* Assets table */}
        <Card>
          <CardContent sx={{ pb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <StorageIcon sx={{ opacity: 0.7 }} />
              <Typography sx={{ fontWeight: 900 }}>Assets (Live)</Typography>
            </Box>

            <Box sx={{ height: 520 }}>
              <DataGrid
                sx={gridSx}
                density="compact"
                rows={assets}
                getRowId={(r) => r.asset_id}
                columns={assetCols}
                onRowClick={(p) => {
                  // Selecting an asset focuses the map and clears event selection
                  setSelectedAssetId(p.row.asset_id);
                  setSelectedEventId(null);
                }}
                pageSizeOptions={[25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
                disableRowSelectionOnClick
              />
            </Box>
          </CardContent>
        </Card>

        {/* Alerts table */}
        <Card>
          <CardContent sx={{ pb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <NotificationsActiveIcon sx={{ opacity: 0.7 }} />
              <Typography sx={{ fontWeight: 900 }}>Alerts (Live)</Typography>
            </Box>

            <Box sx={{ height: 520 }}>
              <DataGrid
                sx={gridSx}
                density="compact"
                rows={alerts}
                getRowId={(r) => r.alert_id}
                columns={alertCols}
                onRowClick={(p) => {
                  /**
                   * Clicking an alert focuses the related entity if present:
                   * - Prefer related_event_id
                   * - Otherwise fall back to related_asset_id
                   */
                  const a = p.row;

                  if (a.related_event_id) {
                    setSelectedEventId(a.related_event_id);
                    setSelectedAssetId(null);
                    return;
                  }

                  if (a.related_asset_id) {
                    setSelectedAssetId(a.related_asset_id);
                    setSelectedEventId(null);
                  }
                }}
                pageSizeOptions={[25, 50]}
                initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
                disableRowSelectionOnClick
              />
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

/**
 * KpiCard
 * -------
 * Small reusable KPI widget:
 * - Title + icon
 * - Big numeric headline
 * - Supporting chips (status breakdown)
 */
function KpiCard({ title, big, chips = [], icon }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {icon}
          <Typography variant="overline" sx={{ opacity: 0.8 }}>
            {title}
          </Typography>
        </Box>

        <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5 }}>
          {big}
        </Typography>

        <Divider sx={{ my: 1 }} />

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {chips.map((c, idx) => (
            <Chip key={idx} size="small" label={c.label} color={c.color} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
