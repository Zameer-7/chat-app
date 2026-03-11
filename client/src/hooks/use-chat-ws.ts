import { useCallback, useState } from "react";
import { wsPaths } from "@shared/routes";
import { useSocket } from "./use-socket";

export function useChatWebSocket(roomId: string, _username: string | null) {
  const [typingUsers] = useState<Set<string>>(new Set());
  const [onlineUsers] = useState<Record<string, { status: string; lastSeen?: string }>>({});

  const wsPath = useCallback(() => wsPaths.room(roomId), [roomId]);
  const { status, send } = useSocket(wsPath);

  return {
    status,
    sendMessage: (content: string) => send({ type: "room_message", content }),
    sendTypingStatus: (_isTyping: boolean) => {},
    typingUsers,
    onlineUsers,
  };
}
