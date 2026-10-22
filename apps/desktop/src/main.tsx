import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { startDesktopAnalytics } from "./lib/analytics";
import "./styles.css";

startDesktopAnalytics();

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", prefersDark.matches);
applyTheme();
prefersDark.addEventListener("change", applyTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
