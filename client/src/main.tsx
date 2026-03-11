import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clean up old localStorage tokens (migrated to httpOnly cookies)
localStorage.removeItem("chat_app_token");
localStorage.removeItem("chat_app_refresh_token");

// Register service worker for PWA support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((err) => console.warn("[SW] Registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
