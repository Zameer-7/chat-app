import { useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "@/services/api";

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

    const configuredBase = (import.meta.env.VITE_WS_BASE_URL || "").replace(/\/+$/, "");
    const fallbackProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = configuredBase || `${fallbackProtocol}//${window.location.host}`;
    const ws = new WebSocket(`${wsBase}${path}`);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("disconnected");
    ws.onmessage = (event) => {
      try {
        setLastEvent(JSON.parse(event.data));
      } catch {
        setLastEvent(null);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [path]);

  function send(payload: unknown) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  return { status, lastEvent, send };
}
