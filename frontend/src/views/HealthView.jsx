// src/HealthView.jsx
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { Box, Typography, Chip, Card, CardContent, Divider } from "@mui/material";

// Icons for visual scanning (status + categories)
import ApiIcon from "@mui/icons-material/Api";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import StorageIcon from "@mui/icons-material/Storage";
import EventIcon from "@mui/icons-material/Event";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import BoltIcon from "@mui/icons-material/Bolt";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MemoryIcon from "@mui/icons-material/Memory";

/**
 * HealthView
 * ----------
 * A dashboard-style page that summarizes:
 * - API health status
 * - latency/uptime/telemetry
 * - SSE stream status (connected/down + last event timestamp)
 * - local sync metadata (cache vs network)
 * - optional dependency details (redis)
 * - client-side error log
 *
 * This view is driven entirely by the `system` slice, which is kept up-to-date
 * by the global data layer (polling + SSE).
 */
export default function HealthView() {
  // Core health info polled from /api/health
  const health = useSelector((s) => s.system.health);
  const lastHealthUtc = useSelector((s) => s.system.lastHealthUtc);

  // Full sync metadata (cache vs network + last sync time)
  const lastFullSyncUtc = useSelector((s) => s.system.lastFullSyncUtc);
  const source = useSelector((s) => s.system.source);

  // Client-side error log (bounded list)
  const sysErrors = useSelector((s) => s.system.errors);

  // SSE stream status (maintained by data layer)
  const sseState = useSelector((s) => s.system.sse?.state || "connecting");
  const lastSseUtc = useSelector((s) => s.system.sse?.lastEventUtc || null);

  // Safe derived flags/defaults
  const apiOk = Boolean(health?.ok);

  // Optional server-provided counts for quick visibility
  const counts = health?.counts ?? { events: "—", assets: "—", alerts: "—" };

  // Uptime (supports multiple field names to be tolerant across backends)
  const uptimeS = health?.uptime_seconds ?? health?.uptime_s ?? null;
  const startedAt = health?.started_at ?? null;

  // Optional dependency block (shown only if backend provides it)
  const redisOk = health?.redis?.ok ?? null;
  const redisInfo = health?.redis ?? null;

  // Optional “freshness” timestamps (latest ingested objects)
  const freshness = health?.freshness ?? null;

  // Optional server/client latency field if you expose it later
  const latencyMs = health?.latency_ms ?? health?.client?.latency_ms ?? null;

  /**
   * Latency stats placeholder:
   * If you later implement rolling min/avg/max, this is where you’d compute it.
   * For now, it mirrors current latency in all three slots.
   */
  const latStats = useMemo(() => {
    if (latencyMs == null) return { min: null, avg: null, max: null };
    return { min: latencyMs, avg: latencyMs, max: latencyMs };
  }, [latencyMs]);

  /**
   * API status chip descriptor (icon + label + MUI color).
   */
  const apiChip = {
    icon: apiOk ? <CheckCircleIcon /> : <ErrorIcon />,
    label: apiOk ? "API OPERATIONAL" : "API DEGRADED",
    color: apiOk ? "success" : "error",
  };

  /**
   * Accent color for SSE state metric.
   * - connected -> green
   * - connecting -> amber
   * - down -> red
   */
  const sseAccent =
    sseState === "connected" ? "success" : sseState === "connecting" ? "warning" : "error";

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {/* HEADER: Title + API status chip */}
      <Card>
        <CardContent sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ApiIcon sx={{ opacity: 0.85 }} />
          <Typography variant="h6" sx={{ fontWeight: 950, letterSpacing: 0.4 }}>
            System Health
          </Typography>

          {/* Spacer pushes chip to the right */}
          <Box sx={{ flex: 1 }} />

          <Chip icon={apiChip.icon} label={apiChip.label} color={apiChip.color} variant="outlined" />
        </CardContent>
      </Card>

      {/* TOP GRID: left = core telemetry, right = dependencies/freshness/posture */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.2fr 0.8fr" },
          gap: 2,
        }}
      >
        {/* LEFT COLUMN */}
        <Box sx={{ display: "grid", gap: 2 }}>
          {/* API Telemetry card */}
          <Card>
            <CardContent>
              <SectionTitle icon={<BoltIcon />} title="API Telemetry" />

              {/* Top metrics */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
                  gap: 2,
                  mt: 1.5,
                }}
              >
                <Metric
                  label="Latency"
                  value={latencyMs != null ? `${Math.round(latencyMs)} ms` : "—"}
                  hint={
                    latencyMs != null
                      ? `min/avg/max: ${latStats.min}/${latStats.avg}/${latStats.max} ms`
                      : "—"
                  }
                />
                <Metric
                  label="Last health"
                  value={lastHealthUtc ? safeTime(lastHealthUtc) : "—"}
                  hint="Polled globally"
                />
                <Metric
                  label="Uptime"
                  value={uptimeS != null ? formatUptime(uptimeS) : "—"}
                  hint={startedAt ? `started_at: ${safeTime(startedAt)}` : "—"}
                />
              </Box>

              <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

              {/* Object counts */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Events: ${counts.events ?? "—"}`}
                  icon={<EventIcon fontSize="small" />}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Assets: ${counts.assets ?? "—"}`}
                  icon={<StorageIcon fontSize="small" />}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Alerts: ${counts.alerts ?? "—"}`}
                  icon={<NotificationsActiveIcon fontSize="small" />}
                />
              </Box>

              <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

              {/* Sync metadata */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Full sync: ${lastFullSyncUtc ? safeTime(lastFullSyncUtc) : "—"}`}
                  icon={<QueryStatsIcon fontSize="small" />}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Source: ${String(source || "—").toUpperCase()}`}
                />
              </Box>
            </CardContent>
          </Card>

          {/* SSE status card */}
          <Card>
            <CardContent>
              <SectionTitle icon={<WifiTetheringIcon />} title="SSE Stream" />

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
                  gap: 2,
                  mt: 1.5,
                }}
              >
                <Metric
                  label="State"
                  value={String(sseState).toUpperCase()}
                  accent={sseAccent}
                />
                <Metric
                  label="Last event"
                  value={lastSseUtc ? safeTime(lastSseUtc) : "—"}
                  hint="hello/heartbeat/data events"
                />
                <Metric
                  label="Endpoint"
                  value="/api/stream"
                  hint="EventSource (global)"
                />
              </Box>

              <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                SSE is opened once at app level. If DOWN, verify backend CORS + SSE headers and heartbeat.
              </Typography>
            </CardContent>
          </Card>

          {/* Client-side error log card */}
          <Card>
            <CardContent>
              <SectionTitle icon={<QueryStatsIcon />} title="Client Errors" />
              <Divider sx={{ my: 1.5, borderColor: "rgba(255,255,255,0.08)" }} />

              {sysErrors?.length ? (
                <Box sx={{ display: "grid", gap: 1 }}>
                  {sysErrors.slice(0, 6).map((e, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        border: "1px solid rgba(231,76,60,0.25)",
                        background: "rgba(231,76,60,0.06)",
                      }}
                    >
                      <Typography className="mono" variant="caption" sx={{ opacity: 0.8 }}>
                        {safeTime(e.t)}
                      </Typography>
                      <Typography sx={{ fontWeight: 750, mt: 0.25 }}>
                        {e.msg}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography sx={{ opacity: 0.75 }}>
                  No client-side errors recorded.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* RIGHT COLUMN: Optional server dependency + freshness + posture */}
        <Box sx={{ display: "grid", gap: 2 }}>
          {/* Dependencies: only shown if backend provides redis info */}
          {redisInfo ? (
            <Card>
              <CardContent>
                <SectionTitle icon={<MemoryIcon />} title="Dependencies" />

                <Box sx={{ display: "grid", gap: 1.2, mt: 1.5 }}>
                  <Row label="Redis">
                    <Chip
                      size="small"
                      variant="outlined"
                      color={redisOk === true ? "success" : redisOk === false ? "error" : "default"}
                      icon={redisOk === true ? <CheckCircleIcon fontSize="small" /> : <ErrorIcon fontSize="small" />}
                      label={redisOk === true ? "HEALTHY" : redisOk === false ? "DOWN" : "UNKNOWN"}
                    />
                  </Row>

                  <Row label="Endpoint">
                    <MonoText
                      value={
                        redisInfo?.host
                          ? `${redisInfo.host}${redisInfo.port ? `:${redisInfo.port}` : ""}`
                          : "—"
                      }
                    />
                  </Row>

                  <Row label="DB">
                    <MonoText value={redisInfo?.db ?? "—"} />
                  </Row>

                  <Row label="Cache efficiency">
                    <MonoText value={formatHitRate(redisInfo)} />
                  </Row>

                  {/* Optional: if you expose memory usage later */}
                  {redisInfo?.memory_used_mb != null ? (
                    <Row label="Memory used">
                      <MonoText value={`${redisInfo.memory_used_mb} MB`} />
                    </Row>
                  ) : null}
                </Box>
              </CardContent>
            </Card>
          ) : null}

          {/* Freshness: only shown if backend provides freshness fields */}
          {freshness ? (
            <Card>
              <CardContent>
                <SectionTitle icon={<AccessTimeIcon />} title="Data Freshness" />

                <Box sx={{ display: "grid", gap: 1.2, mt: 1.5 }}>
                  <Row label="Events latest">
                    <MonoText value={freshness?.events_latest ? safeTime(freshness.events_latest) : "—"} />
                  </Row>
                  <Row label="Assets latest">
                    <MonoText value={freshness?.assets_latest ? safeTime(freshness.assets_latest) : "—"} />
                  </Row>
                  <Row label="Alerts latest">
                    <MonoText value={freshness?.alerts_latest ? safeTime(freshness.alerts_latest) : "—"} />
                  </Row>

                  {freshness?.skew_seconds != null ? (
                    <Row label="Clock skew">
                      <MonoText value={`${freshness.skew_seconds}s`} />
                    </Row>
                  ) : null}
                </Box>
              </CardContent>
            </Card>
          ) : null}

          {/* Operational posture (static summary of your architecture) */}
          <Card>
            <CardContent>
              <SectionTitle icon={<QueryStatsIcon />} title="Operational Posture" />

              <Box sx={{ display: "grid", gap: 1.1, mt: 1.5 }}>
                <Row label="Health model">
                  <MonoText value="Polling + SSE" />
                </Row>
                <Row label="Update semantics">
                  <MonoText value="Periodic sync + stream upserts" />
                </Row>
                <Row label="Client mode">
                  <MonoText value={String(source || "—").toUpperCase()} />
                </Row>
              </Box>

              <Divider sx={{ my: 1.5, borderColor: "rgba(255,255,255,0.08)" }} />

              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                Designed for graceful degradation: cached data remains visible when streaming or backend load fluctuates.
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}

/* ---------------- helpers ---------------- */

/**
 * SectionTitle
 * ------------
 * Small consistent section header with an icon.
 */
function SectionTitle({ icon, title }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box sx={{ opacity: 0.8, display: "flex", alignItems: "center" }}>{icon}</Box>
      <Typography sx={{ fontWeight: 950, letterSpacing: 0.4 }}>{title}</Typography>
    </Box>
  );
}

/**
 * Metric
 * ------
 * A reusable "stat card" element.
 * `accent` controls value color for status signaling.
 */
function Metric({ label, value, hint, accent }) {
  const color =
    accent === "success" ? "rgba(46, 204, 113, 0.95)" :
    accent === "warning" ? "rgba(243, 156, 18, 0.95)" :
    accent === "error" ? "rgba(231, 76, 60, 0.95)" :
    "rgba(255,255,255,0.92)";

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.72, letterSpacing: 0.4 }}>
        {label}
      </Typography>

      <Typography sx={{ fontSize: 22, fontWeight: 950, color, mt: 0.25 }}>
        {value}
      </Typography>

      {hint ? (
        <Typography variant="caption" sx={{ opacity: 0.65 }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Row
 * ---
 * Label/value row used in the right-side panels (Dependencies/Freshness).
 */
function Row({ label, children }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
      <Typography variant="caption" sx={{ opacity: 0.7 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

/**
 * MonoText
 * --------
 * Right-aligned "value" text with monospace styling for technical fields.
 */
function MonoText({ value }) {
  return (
    <Typography className="mono" sx={{ opacity: 0.9 }}>
      {value}
    </Typography>
  );
}

/**
 * safeTime
 * --------
 * Converts a timestamp into a local-readable string.
 * If parsing fails, falls back to raw input value.
 */
function safeTime(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

/**
 * formatUptime
 * ------------
 * Formats seconds into a human-readable uptime string.
 */
function formatUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/**
 * formatHitRate
 * -------------
 * Computes Redis cache hit rate if hits/misses are provided by backend.
 * Supports multiple possible field names to remain backend-tolerant.
 */
function formatHitRate(redisInfo) {
  const hits = redisInfo?.hits ?? redisInfo?.cache_hits ?? null;
  const miss = redisInfo?.misses ?? redisInfo?.cache_misses ?? null;
  if (hits == null || miss == null) return "—";
  const total = Number(hits) + Number(miss);
  if (!total) return "—";
  const rate = Math.round((Number(hits) / total) * 100);
  return `${rate}% (hits ${hits} / miss ${miss})`;
}
