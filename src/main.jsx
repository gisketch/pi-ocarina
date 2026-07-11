import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.jsx";
import "./styles.css";

if (import.meta.env.VITE_E2E === "true") {
  await import("@wdio/tauri-plugin");
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing React root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
