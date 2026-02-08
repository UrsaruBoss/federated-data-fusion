// src/theme.js
/* ===============================
   Global MUI theme configuration
================================ */

import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0b0f14", paper: "#0f1620" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    h5: { fontWeight: 800 },
  },
  components: {
    MuiPaper: {
      styleOverrides: { root: { border: "1px solid rgba(255,255,255,0.08)" } },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: { border: "1px solid rgba(255,255,255,0.10)" },
        columnHeaders: { borderBottom: "1px solid rgba(255,255,255,0.10)" },
      },
    },
  },
});
