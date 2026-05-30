import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
// Eager-import the accent store so its persist middleware rehydrates
// the saved accent into CSS vars before React paints the first frame.
// Without this, users see a brief flash of the default red on reload.
import "./stores/accentStore";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found — index.html is missing #root");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
