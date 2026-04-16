import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initZoom } from "./hooks/useKeyboardShortcuts";
import "./styles/globals.css";

initZoom();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
