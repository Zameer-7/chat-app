import { WebSocket } from "ws";

const userSockets = new Map<number, Set<WebSocket>>();

export function registerUserSocket(userId: number, ws: WebSocket) {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId)!.add(ws);
}

export function unregisterUserSocket(userId: number, ws: WebSocket) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (!sockets.size) {
    userSockets.delete(userId);
  }
}

export function emitToUser(userId: number, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  const message = JSON.stringify(payload);
  sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

export function getOnlineUsersForRoomSockets(ids: number[]) {
  return ids.filter((id) => userSockets.has(id)).length;
}
