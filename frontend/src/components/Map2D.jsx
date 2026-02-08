// src/components/Map2D.jsx
/* ===============================
   Interactive 2D map component (React Leaflet)
   --------------------------------------------
   Renders:
   - Events (severity-colored markers)
   - Assets (status-colored markers)
   - Popups with structured info (MUI styling)
   - Auto fly-to behavior when something is selected
================================ */

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { Typography, Box, Divider, Chip } from "@mui/material";

/**
 * Color mapping for event severity.
 * Keeps visual meaning consistent across UI.
 */
const sevColor = (s) =>
  s === "critical" ? "red" :
  s === "high" ? "orange" :
  s === "medium" ? "dodgerblue" : "lime";

/**
 * Color mapping for asset operational status.
 */
const stColor = (s) =>
  s === "offline" ? "red" :
  s === "degraded" ? "orange" : "lime";

/**
 * FlyToSelected
 * -------------
 * Small helper component that “listens” for changes in `selected`
 * and animates the map camera to that item.
 *
 * Uses Leaflet’s map instance via `useMap()`.
 */
function FlyToSelected({ selected }) {
  const map = useMap();

  useEffect(() => {
    // Nothing selected -> do nothing
    if (!selected) return;

    const { lat, lon } = selected;

    // Defensive checks: avoid NaNs and Leaflet errors
    if (typeof lat !== "number" || typeof lon !== "number") return;

    // Fly to selected location.
    // Zoom at least 6, but don't zoom out if user is already closer.
    map.flyTo([lat, lon], Math.max(map.getZoom(), 6), { duration: 0.6 });
  }, [selected, map]);

  return null;
}

/**
 * Shared popup styling (MUI Box sx)
 * Gives a “glass / dark UI” overlay look.
 */
const popupSx = {
  width: 280,
  p: 1.25,
  borderRadius: 2,
  bgcolor: "rgba(15, 22, 32, 0.96)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "white",
  boxShadow: "0 14px 50px rgba(0,0,0,0.70)",
  backdropFilter: "blur(10px)",
};

/**
 * Row layout used inside popups:
 * left label + right value, aligned and spaced.
 */
const rowSx = { display: "flex", justifyContent: "space-between", gap: 1, mt: 0.5 };

/**
 * Map2D
 * -----
 * Props:
 * - events: array of event objects (expects { event_id, lat, lon, severity, ... })
 * - assets: array of asset objects (expects { asset_id, lat, lon, status, ... })
 * - selectedEventId / selectedAssetId: used for “selection highlight + flyTo”
 * - height: number or string (e.g. 420 or "100%") for flexible layout usage
 */
export default function Map2D({
  events = [],
  assets = [],
  selectedEventId = null,
  selectedAssetId = null,
  height = 420, // can be 420 or "100%" depending on parent layout
}) {
  // Default initial center (Europe-ish)
  const center = [48.0, 10.0];

  /**
   * Determine what is currently selected, based on IDs.
   * This drives the FlyToSelected helper + selection sizing.
   */
  const selected = useMemo(() => {
    if (selectedEventId) return events.find((e) => e.event_id === selectedEventId) || null;
    if (selectedAssetId) return assets.find((a) => a.asset_id === selectedAssetId) || null;
    return null;
  }, [selectedEventId, selectedAssetId, events, assets]);

  return (
    <div
      style={{
        height,               // important: wrapper controls map height
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <MapContainer
        center={center}
        zoom={4}
        style={{ height: "100%", width: "100%" }} // important: map fills wrapper
      >
        {/* Dark basemap tiles */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
        />

        {/* Auto-fly to selected event/asset */}
        <FlyToSelected selected={selected} />

        {/* EVENTS layer */}
        {events.slice(0, 200).map((e) => {
          const isSelected = e.event_id === selectedEventId;
          const color = sevColor(e.severity);

          // Skip invalid coordinates to prevent Leaflet errors
          if (typeof e.lat !== "number" || typeof e.lon !== "number") return null;

          return (
            <CircleMarker
              key={e.event_id}
              center={[e.lat, e.lon]}
              radius={isSelected ? 10 : 7} // selected marker is larger
              pathOptions={{
                color,
                weight: isSelected ? 3 : 2,
                opacity: 1,
                fillOpacity: isSelected ? 0.9 : 0.6,
              }}
            >
              {/* Popup for event details */}
              <Popup closeButton={false} autoPanPadding={[20, 20]}>
                <Box sx={popupSx}>
                  {/* Header row */}
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.3 }}>
                      EVENT
                    </Typography>
                    <Chip size="small" variant="outlined" label={e.severity?.toUpperCase() ?? "—"} />
                  </Box>

                  {/* Event type + source */}
                  <Typography sx={{ mt: 0.5, fontWeight: 800, fontSize: 12, opacity: 0.9 }}>
                    {e.type ?? "unknown"} • {e.source ?? "—"}
                  </Typography>

                  <Divider sx={{ my: 1, borderColor: "rgba(255,255,255,0.10)" }} />

                  {/* ID */}
                  <Box sx={rowSx}>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>ID</Typography>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", opacity: 0.95 }}>
                      {e.event_id}
                    </Typography>
                  </Box>

                  {/* Confidence score */}
                  <Box sx={rowSx}>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Confidence</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.95 }}>
                      {typeof e.confidence === "number" ? e.confidence.toFixed(2) : "—"}
                    </Typography>
                  </Box>

                  {/* Coordinates */}
                  <Box sx={rowSx}>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Coords</Typography>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", opacity: 0.95 }}>
                      {Number(e.lat).toFixed(3)}, {Number(e.lon).toFixed(3)}
                    </Typography>
                  </Box>

                  {/* Optional metadata chips */}
                  {e.meta?.region && (
                    <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <Chip size="small" label={`Region: ${e.meta.region}`} variant="outlined" />
                    </Box>
                  )}
                </Box>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* ASSETS layer */}
        {assets.slice(0, 300).map((a) => {
          const isSelected = a.asset_id === selectedAssetId;
          const color = stColor(a.status);

          // Skip invalid coordinates
          if (typeof a.lat !== "number" || typeof a.lon !== "number") return null;

          return (
            <CircleMarker
              key={a.asset_id}
              center={[a.lat, a.lon]}
              radius={isSelected ? 9 : 5} // selected marker is larger
              pathOptions={{
                color,
                weight: isSelected ? 3 : 2,
                opacity: 1,
                fillOpacity: isSelected ? 0.9 : 0.55,
              }}
            >
              {/* Popup for asset details */}
              <Popup closeButton={false} autoPanPadding={[20, 20]}>
                <Box sx={popupSx}>
                  {/* Header row */}
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.3 }}>
                      ASSET
                    </Typography>
                    <Chip size="small" variant="outlined" label={a.status?.toUpperCase() ?? "—"} />
                  </Box>

                  {/* Asset name */}
                  <Typography sx={{ mt: 0.5, fontWeight: 800, fontSize: 12, opacity: 0.9 }}>
                    {a.name ?? "—"}
                  </Typography>

                  {/* Asset type + owner */}
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {a.asset_type ?? "—"} • {a.owner_team ?? "—"}
                  </Typography>

                  <Divider sx={{ my: 1, borderColor: "rgba(255,255,255,0.10)" }} />

                  {/* ID */}
                  <Box sx={rowSx}>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>ID</Typography>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", opacity: 0.95 }}>
                      {a.asset_id}
                    </Typography>
                  </Box>

                  {/* Coordinates */}
                  <Box sx={rowSx}>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>Coords</Typography>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", opacity: 0.95 }}>
                      {Number(a.lat).toFixed(3)}, {Number(a.lon).toFixed(3)}
                    </Typography>
                  </Box>
                </Box>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
