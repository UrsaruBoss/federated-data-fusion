// src/main.jsx
/* ===============================
   Main entry point of the React application, rendering the root component and setting up providers
================================ */

import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";

import App from "./App";
import { store } from "./store/store";
import { theme } from "./theme";
import "./index.css";
import "leaflet/dist/leaflet.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </Provider>
);
