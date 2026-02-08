// src/App.jsx
/* ===============================
    Main application component defining the routing structure and layout
================================ */

import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";

import OpsView from "./views/OpsView";
import WallView from "./views/WallView";
import HealthView from "./views/HealthView";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/ops" replace />} />
        <Route path="/ops" element={<OpsView />} />
        <Route path="/wall" element={<WallView />} />
        <Route path="/health" element={<HealthView />} />
        <Route path="*" element={<Navigate to="/ops" replace />} />
      </Route>
    </Routes>
  );
}
