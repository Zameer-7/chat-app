import { useEffect, useRef, useState } from "react";
import { api } from "@shared/routes";
import { getToken } from "@/services/api";
import { buildApiUrl } from "@/config/api";

// ─── BeforeInstallPromptEvent type (not in standard TS lib) ────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ─── Decode VAPID base64url key to Uint8Array ───────────────────────────────
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

// ─── Main hook ──────────────────────────────────────────────────────────────
export function usePwa() {
  const [canInstall, setCanInstall] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  // Listen for install prompt
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => setCanInstall(false);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Trigger install prompt
  async function installApp() {
    if (!deferredRef.current) return;
    deferredRef.current.prompt();
    await deferredRef.current.userChoice;
    deferredRef.current = null;
    setCanInstall(false);
  }

  // Request notification permission + subscribe to push
  async function requestNotifications(): Promise<boolean> {
    if (typeof Notification === "undefined") return false;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === "granted") {
      await _subscribeToPush();
    }
    return permission === "granted";
  }

  // Register push subscription with backend
  async function _subscribeToPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;

      // Fetch VAPID public key — no-auth required
      const res = await fetch(buildApiUrl(api.push.vapidPublicKey));
      if (!res.ok) return; // push not configured on server

      const { publicKey } = (await res.json()) as { publicKey: string };

      // Reuse existing subscription if available
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = sub.toJSON();
      const token = getToken();
      if (!token) return;

      await fetch(buildApiUrl(api.push.subscribe), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: (json.keys as Record<string, string> | undefined)?.p256dh,
          auth: (json.keys as Record<string, string> | undefined)?.auth,
        }),
      });
    } catch {
      // Non-fatal: push subscription is best-effort
    }
  }

  return {
    canInstall,
    installApp,
    notifPermission,
    requestNotifications,
  };
}
