import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { StreamNotifier } from "./components/stream-notifier";
import { initializeOneSignal } from "./lib/onesignal";
import "./styles.css";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/home" element={<StreamNotifier />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </HashRouter>
  );
}

void initializeOneSignal();

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
