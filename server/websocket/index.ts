import type { Server } from "http";
import { parse } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { repository } from "../models/repository";
import { verifyToken } from "../middleware/auth";
import { emitToUser, registerUserSocket, unregisterUserSocket } from "./notifier";
import { sendPushNotification } from "../routes/push";

type SocketUser = { userId: number; username: string };

function safeSend(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Global reference so routes can trigger broadcasts
let _roomClients: Map<string, Set<WebSocket>>;

export function broadcastToRoom(roomId: string, payload: unknown) {
  _roomClients?.get(roomId)?.forEach((client) => safeSend(client, payload));
}

export function registerWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  const roomClients = new Map<string, Set<WebSocket>>();
  const socketUsers = new Map<WebSocket, SocketUser>();
  const userConnections = new Map<number, Set<WebSocket>>();
  const directSubscribers = new Map<number, Map<number, Set<WebSocket>>>();
  _roomClients = roomClients;

  async function markPresence(userId: number, isOnline: boolean) {
    await repository.setUserOnlineStatus(userId, isOnline);

    const lastSeen = isOnline ? undefined : new Date().toISOString();
    const presencePayload = { type: "presence_update", userId, isOnline, lastSeen };

    // Broadcast to all friends via their global user socket
    const friendIds = await repository.listFriendIds(userId);
    for (const fid of friendIds) {
      emitToUser(fid, presencePayload);
    }

    // Also notify direct subscribers (users viewing this user's DM screen)
    const subscribers = directSubscribers.get(userId);
    if (subscribers) {
      subscribers.forEach((sockets) => {
        sockets.forEach((ws) => safeSend(ws, presencePayload));
      });
    }
  }

  function notifyMessageStatus(_messageId: number, payload: Record<string, unknown>) {
    const senderId = Number(payload.senderId || 0);
    const receiverId = payload.receiverId ? Number(payload.receiverId) : null;
    if (senderId) emitToUser(senderId, payload);
    if (receiverId) emitToUser(receiverId, payload);
  }

  server.on("upgrade", (request, socket, head) => {
    const { pathname, query } = parse(request.url || "", true);
    if (!pathname) {
      socket.destroy();
      return;
    }

    const token = Array.isArray(query.token) ? query.token[0] : query.token;
    if (!token) {
      socket.destroy();
      return;
    }

    try {
      const payload = verifyToken(token);

      const roomMatch = pathname.match(/^\/ws\/room\/([^/]+)$/);
      const directMatch = pathname.match(/^\/ws\/direct\/(\d+)$/);
      const userMatch = pathname.match(/^\/ws\/user$/);

      if (!roomMatch && !directMatch && !userMatch) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as WebSocket & { meta?: { roomId?: string; friendId?: number; payload: SocketUser } }).meta = {
          roomId: roomMatch?.[1],
          friendId: directMatch ? Number(directMatch[1]) : undefined,
          payload: { userId: payload.userId, username: payload.username },
        };
        wss.emit("connection", ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: WebSocket & { meta?: { roomId?: string; friendId?: number; payload: SocketUser } }) => {
    if (!ws.meta) {
      ws.close();
      return;
    }

    const { roomId, friendId, payload } = ws.meta;
    socketUsers.set(ws, payload);

    if (!userConnections.has(payload.userId)) {
      userConnections.set(payload.userId, new Set());
      await markPresence(payload.userId, true);
    }
    userConnections.get(payload.userId)!.add(ws);
    registerUserSocket(payload.userId, ws);

    if (roomId) {
      if (!roomClients.has(roomId)) {
        roomClients.set(roomId, new Set());
      }
      roomClients.get(roomId)!.add(ws);

      const seenUpdates = await repository.markRoomMessagesSeen(roomId, payload.userId);
      seenUpdates.rows.forEach((row: any) => {
        const event = { type: "message_seen", messageId: row.id, roomId, userId: payload.userId, senderId: row.senderId };
        roomClients.get(roomId)?.forEach((client) => safeSend(client, event));
        userConnections.get(Number(row.senderId))?.forEach((senderSocket) => safeSend(senderSocket, event));
      });
    }

    if (friendId) {
      if (!directSubscribers.has(friendId)) {
        directSubscribers.set(friendId, new Map());
      }
      const byWatcher = directSubscribers.get(friendId)!;
      if (!byWatcher.has(payload.userId)) {
        byWatcher.set(payload.userId, new Set());
      }
      byWatcher.get(payload.userId)!.add(ws);

      const seenUpdates = await repository.markDirectMessagesSeen(payload.userId, friendId);
      seenUpdates.rows.forEach((row: any) => {
        notifyMessageStatus(Number(row.id), {
          type: "message_seen",
          messageId: row.id,
          userId: payload.userId,
          senderId: row.senderId,
          receiverId: row.receiverId,
        });
      });
    }

    ws.on("message", async (raw) => {
      try {
        const user = socketUsers.get(ws);
        if (!user) return;

        const body = JSON.parse(raw.toString("utf8"));

        if (roomId && body.type === "room_message" && (body.content || body.gifUrl)) {
          const member = await repository.isActiveRoomMember(user.userId, roomId);
          if (!member) {
            safeSend(ws, { type: "error", message: "You left this room. Rejoin to send messages." });
            return;
          }

          const clientMessageId = body.clientMessageId ? String(body.clientMessageId) : undefined;
          const replyToId = body.replyToId ? Number(body.replyToId) : null;
          const effectiveRoomMsgType = body.messageType === "image" ? "image" : body.gifUrl ? "gif" : "text";
          const msg = await repository.createRoomMessage({
            roomId,
            senderId: user.userId,
            content: body.content ? String(body.content) : "",
            messageType: effectiveRoomMsgType,
            gifUrl: body.gifUrl ? String(body.gifUrl) : null,
            replyToId: replyToId && Number.isInteger(replyToId) ? replyToId : null,
          });

          safeSend(ws, { type: "message_sent", messageId: msg.id, roomId, status: "sent", clientMessageId });

          roomClients.get(roomId)?.forEach((client) => {
            safeSend(client, { type: "room_message", clientMessageId, ...msg });
          });

          const audience = roomClients.get(roomId)?.size || 0;
          if (audience > 1) {
            await repository.updateMessageStatus(msg.id, "delivered");
            roomClients.get(roomId)?.forEach((client) => {
              safeSend(client, { type: "message_delivered", messageId: msg.id, roomId, status: "delivered", senderId: user.userId });
            });
          }
          return;
        }

        if (friendId && body.type === "direct_message" && (body.content || body.gifUrl)) {
          const clientMessageId = body.clientMessageId ? String(body.clientMessageId) : undefined;
          const isFriend = await repository.areFriends(user.userId, friendId);
          if (!isFriend) {
            safeSend(ws, { type: "error", message: "You can only message accepted friends" });
            return;
          }

          const dmReplyToId = body.replyToId ? Number(body.replyToId) : null;
          const effectiveDmMsgType = body.messageType === "image" ? "image" : body.gifUrl ? "gif" : "text";
          const msg = await repository.createDirectMessage(
            user.userId,
            friendId,
            body.content ? String(body.content) : "",
            effectiveDmMsgType,
            body.gifUrl ? String(body.gifUrl) : null,
            dmReplyToId && Number.isInteger(dmReplyToId) ? dmReplyToId : null,
          );
          safeSend(ws, { type: "message_sent", messageId: msg.id, status: "sent", senderId: user.userId, receiverId: friendId, clientMessageId });

          const senderSockets = userConnections.get(user.userId) || new Set<WebSocket>();
          const receiverSockets = userConnections.get(friendId) || new Set<WebSocket>();
          const allSockets = Array.from(senderSockets).concat(Array.from(receiverSockets));
          allSockets.forEach((client) => {
            safeSend(client, { type: "direct_message", clientMessageId, ...msg });
          });

          if (receiverSockets.size > 0) {
            await repository.updateMessageStatus(msg.id, "delivered");
            notifyMessageStatus(msg.id, {
              type: "message_delivered",
              messageId: msg.id,
              senderId: user.userId,
              receiverId: friendId,
              status: "delivered",
            });
          } else {
            // Receiver is offline — send background push notification (check mute first)
            const isMuted = await repository.isChatMuted(friendId, { friendId: user.userId });
            if (!isMuted) {
              const preview =
                msg.messageType === "gif"
                  ? "Sent a GIF 🎞️"
                  : msg.messageType === "image"
                    ? "Sent an image 🖼️"
                    : (msg.content || "").slice(0, 120);
              sendPushNotification(friendId, {
                title: "New Message — Vibely",
                body: `${msg.senderNickname}: ${preview}`,
                url: `/dm/${user.userId}`,
                tag: `dm-${user.userId}`,
              }).catch(() => {});
            }
          }

          const receiverActiveWithSender = directSubscribers.get(user.userId)?.has(friendId);
          if (receiverActiveWithSender) {
            await repository.updateMessageStatus(msg.id, "seen");
            notifyMessageStatus(msg.id, {
              type: "message_seen",
              messageId: msg.id,
              senderId: user.userId,
              receiverId: friendId,
              userId: friendId,
            });
          }
          return;
        }

        if (body.type === "reaction_add" && body.messageId && body.reaction) {
          const messageId = Number(body.messageId);
          if (!Number.isInteger(messageId) || messageId <= 0) {
            safeSend(ws, { type: "error", message: "Invalid message id" });
            return;
          }

          const message = await repository.getMessageById(messageId);
          if (!message) {
            safeSend(ws, { type: "error", message: "Message not found" });
            return;
          }

          await repository.addOrUpdateReaction(messageId, user.userId, String(body.reaction));
          const reactions = await repository.getMessageReactions(messageId);
          const payload = {
            type: "reaction_added",
            messageId,
            userId: user.userId,
            reaction: String(body.reaction),
            counts: reactions.rows,
          };

          if (message.roomId) {
            roomClients.get(message.roomId)?.forEach((client) => safeSend(client, payload));
          } else {
            emitToUser(message.senderId, payload);
            if (message.receiverId) emitToUser(message.receiverId, payload);
          }
          return;
        }

        if (body.type === "message_delete" && body.messageId && body.scope) {
          const messageId = Number(body.messageId);
          if (!Number.isInteger(messageId) || messageId <= 0) {
            safeSend(ws, { type: "error", message: "Invalid message id" });
            return;
          }

          const message = await repository.getMessageById(messageId);
          if (!message) {
            safeSend(ws, { type: "error", message: "Message not found" });
            return;
          }

          if (body.scope === "me") {
            await repository.deleteMessageForMe(messageId, user.userId);
            safeSend(ws, { type: "message_deleted", scope: "me", messageId, userId: user.userId });
            return;
          }

          if (body.scope === "everyone") {
            try {
              const updated = await repository.deleteMessageForEveryone(messageId, user.userId);
              if (!updated) {
                safeSend(ws, { type: "error", message: "Message not found" });
                return;
              }

              const payload = { type: "message_deleted", scope: "everyone", messageId, userId: user.userId };
              if (updated.roomId) {
                roomClients.get(updated.roomId)?.forEach((client) => safeSend(client, payload));
              } else {
                emitToUser(updated.senderId, payload);
                if (updated.receiverId) emitToUser(updated.receiverId, payload);
              }
            } catch (err) {
              safeSend(ws, { type: "error", message: (err as Error).message });
            }
            return;
          }
        }

        if (body.type === "message_edit" && body.messageId && body.content) {
          const messageId = Number(body.messageId);
          if (!Number.isInteger(messageId) || messageId <= 0) {
            safeSend(ws, { type: "error", message: "Invalid message id" });
            return;
          }
          try {
            const updated = await repository.editMessage(messageId, user.userId, String(body.content));
            if (!updated) {
              safeSend(ws, { type: "error", message: "Message not found" });
              return;
            }
            const payload = {
              type: "message_updated",
              messageId: updated.id,
              content: updated.content,
              edited: updated.edited,
              editedAt: updated.editedAt,
            };
            if (updated.roomId) {
              roomClients.get(updated.roomId)?.forEach((client) => safeSend(client, payload));
            } else {
              emitToUser(updated.senderId, payload);
              if (updated.receiverId) emitToUser(updated.receiverId, payload);
            }
          } catch (err) {
            safeSend(ws, { type: "error", message: (err as Error).message });
          }
          return;
        }

        if (body.type === "typing" && typeof body.isTyping === "boolean") {
          const typingPayload = {
            type: "typing",
            userId: user.userId,
            username: user.username,
            isTyping: Boolean(body.isTyping),
          };

          if (roomId) {
            roomClients.get(roomId)?.forEach((client) => {
              if (client !== ws) safeSend(client, typingPayload);
            });
          }

          if (friendId) {
            userConnections.get(friendId)?.forEach((client) => safeSend(client, typingPayload));
          }
          return;
        }
      } catch {
        safeSend(ws, { type: "error", message: "Invalid message format" });
      }
    });

    ws.on("close", async () => {
      const user = socketUsers.get(ws);
      if (!user) return;

      socketUsers.delete(ws);

      if (roomId) {
        const roomSet = roomClients.get(roomId);
        roomSet?.delete(ws);
        if (roomSet && roomSet.size === 0) {
          roomClients.delete(roomId);
        }
      }

      if (friendId) {
        const byWatcher = directSubscribers.get(friendId);
        const watcherSet = byWatcher?.get(user.userId);
        watcherSet?.delete(ws);
        if (watcherSet && watcherSet.size === 0) {
          byWatcher?.delete(user.userId);
        }
        if (byWatcher && byWatcher.size === 0) {
          directSubscribers.delete(friendId);
        }
      }

      const connections = userConnections.get(user.userId);
      connections?.delete(ws);
      unregisterUserSocket(user.userId, ws);
      if (connections && connections.size === 0) {
        userConnections.delete(user.userId);
        await markPresence(user.userId, false);
      }
    });
  });
}
