import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type MessageResponse } from "@shared/routes";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useChatWebSocket(roomId: string, username: string | null) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!username || !roomId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/room/${roomId}?username=${encodeURIComponent(username)}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      // Optional: implement exponential backoff reconnection here
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Append new message to the query cache so UI updates instantly
        queryClient.setQueryData<MessageResponse[]>(
          [api.rooms.messages.list.path, roomId],
          (old) => {
            if (!old) return [data];
            // Prevent duplicates if we implement optimistic UI later
            if (old.some(m => m.id === data.id)) return old; 
            return [...old, data];
          }
        );
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

  }, [roomId, username, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content }));
    } else {
      console.warn("WebSocket is not connected");
    }
  }, []);

  return { status, sendMessage };
}
