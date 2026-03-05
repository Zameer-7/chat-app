import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type MessageResponse } from "@shared/routes";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useChatWebSocket(roomId: string, username: string | null) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<Record<string, { status: string, lastSeen?: string }>>({});
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
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
          queryClient.setQueryData<MessageResponse[]>(
            [api.rooms.messages.list.path, roomId],
            (old) => {
              if (!old) return [data];
              if (old.some(m => m.id === data.id)) return old; 
              return [...old, data];
            }
          );
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(data.username);
            return next;
          });
        } else if (data.type === 'typing_start') {
          setTypingUsers(prev => new Set(prev).add(data.userId));
        } else if (data.type === 'typing_stop') {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(data.userId);
            return next;
          });
        } else if (data.type === 'user_status') {
          setOnlineUsers(prev => ({
            ...prev,
            [data.userId]: { status: data.status, lastSeen: data.lastSeen }
          }));
        }
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
    }
  }, []);

  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: isTyping ? "typing_start" : "typing_stop" 
      }));
    }
  }, []);

  return { status, sendMessage, sendTypingStatus, typingUsers, onlineUsers };
}
