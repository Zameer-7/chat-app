import { useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "@/services/api";
import { getWebSocketBaseUrl } from "@/config/api";

type SocketStatus = "connecting" | "connected" | "disconnected";

export function useSocket(pathFactory: (token: string) => string) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const path = useMemo(() => {
    const token = getToken();
    if (!token) {
      return null;
    }
    return pathFactory(token);
  }, [pathFactory]);

  useEffect(() => {
    if (!path) {
      setStatus("disconnected");
      return;
    }

    let destroyed = false;
    let reconnectTimer: number;
    let reconnectDelay = 1000;
    const wsBase = getWebSocketBaseUrl();

    function connect() {
      if (destroyed) return;
      const ws = new WebSocket(`${wsBase}${path}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        reconnectDelay = 1000; // Reset backoff on successful connect
        // Drain offline message queue for this connection
        const queueKey = `vibely-queue:${path}`;
        try {
          const queued: unknown[] = JSON.parse(localStorage.getItem(queueKey) ?? "[]");
          if (queued.length > 0) {
            localStorage.removeItem(queueKey);
            queued.forEach((msg) => ws.send(JSON.stringify(msg)));
          }
        } catch {
          localStorage.removeItem(`vibely-queue:${path}`);
        }
      };
      ws.onclose = () => {
        setStatus("disconnected");
        // Auto-reconnect with exponential backoff capped at 30s
        reconnectTimer = window.setTimeout(() => connect(), reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };
      ws.onerror = () => setStatus("disconnected");
      ws.onmessage = (event) => {
        try {
          setLastEvent(JSON.parse(event.data));
        } catch {
          setLastEvent(null);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [path]);

  function send(payload: unknown) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return;
    }
    // Queue message-type events when offline; skip volatile events like typing
    const msg = payload as { type?: string };
    if (msg?.type === "room_message" || msg?.type === "direct_message") {
      const queueKey = `vibely-queue:${path}`;
      try {
        const queue: unknown[] = JSON.parse(localStorage.getItem(queueKey) ?? "[]");
        queue.push(payload);
        // Cap queue at 20 messages to avoid unbounded storage
        localStorage.setItem(queueKey, JSON.stringify(queue.slice(-20)));
      } catch {
        // localStorage might be unavailable (private mode / quota exceeded)
      }
    }
  }

  return { status, lastEvent, send };
}
