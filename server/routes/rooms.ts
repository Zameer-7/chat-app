import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";
import { getOnlineUsersForRoomSockets } from "../websocket/notifier";
import { broadcastToRoom } from "../websocket/index";

export function registerRoomRoutes(app: Express) {
  app.post("/api/rooms", authMiddleware, async (req: AuthedRequest, res) => {
    const roomName = req.body?.roomName ? String(req.body.roomName).trim().slice(0, 50) : undefined;
    const room = await repository.createRoom(req.user!.userId, roomName);
    await repository.joinRoom(req.user!.userId, room.id);
    broadcastToRoom(room.id, { type: "user_joined", roomId: room.id, userId: req.user!.userId });
    return res.status(201).json(room);
  });

  app.get("/api/rooms/joined", authMiddleware, async (req: AuthedRequest, res) => {
    const joined = await repository.getJoinedRooms(req.user!.userId);
    return res.json(joined.rows);
  });

  app.get("/api/rooms/:id", authMiddleware, async (req, res) => {
    const roomId = String(req.params.id);
    const room = await repository.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    return res.json(room);
  });

  app.put("/api/rooms/:id", authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const roomId = String(req.params.id);
      const roomName = req.body?.roomName ? String(req.body.roomName).trim() : "";
      if (!roomName) return res.status(400).json({ message: "Room name is required" });
      const updated = await repository.renameRoom(roomId, req.user!.userId, roomName);
      broadcastToRoom(roomId, { type: "room_renamed", roomId, roomName: updated.roomName });
      return res.json(updated);
    } catch (err: any) {
      return res.status(err.status || 500).json({ message: err.message || "Failed to rename room" });
    }
  });

  app.get("/api/rooms/:id/members", authMiddleware, async (req, res) => {
    const roomId = String(req.params.id);
    const room = await repository.getRoom(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    const members = await repository.getRoomMembers(roomId);
    return res.json(members.rows);
  });

  app.get("/api/rooms/:id/messages", authMiddleware, async (req: AuthedRequest, res) => {
    const roomId = String(req.params.id);
    const room = await repository.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const isMember = await repository.isRoomMember(req.user!.userId, roomId);
    if (!isMember) {
      return res.status(403).json({ message: "Join room before viewing messages" });
    }

    const isActive = await repository.isActiveRoomMember(req.user!.userId, roomId);
    if (isActive) {
      await repository.markRoomMessagesSeen(roomId, req.user!.userId);
    }
    const before = req.query.before ? String(req.query.before) : undefined;
    const messages = await repository.getRoomMessages(roomId, req.user!.userId, before);
    return res.json(messages.rows);
  });

  app.post("/api/rooms/:id/join", authMiddleware, async (req: AuthedRequest, res) => {
    const roomId = String(req.params.id);
    const room = await repository.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    const joined = await repository.joinRoom(req.user!.userId, roomId);
    broadcastToRoom(roomId, { type: "user_joined", roomId, userId: req.user!.userId });
    return res.json(joined);
  });

  app.post("/api/rooms/:id/leave", authMiddleware, async (req: AuthedRequest, res) => {
    const roomId = String(req.params.id);
    await repository.leaveRoom(req.user!.userId, roomId);
    broadcastToRoom(roomId, { type: "user_left", roomId, userId: req.user!.userId });
    return res.json({ message: "You left this room" });
  });

  app.delete("/api/rooms/:id", authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const roomId = String(req.params.id);
      await repository.deleteRoom(roomId, req.user!.userId);
      broadcastToRoom(roomId, { type: "room_deleted", roomId });
      return res.json({ message: "Room deleted" });
    } catch (err: any) {
      const status = err.status || 500;
      return res.status(status).json({ message: err.message || "Failed to delete room" });
    }
  });

  app.get("/api/rooms/:id/stats", authMiddleware, async (req, res) => {
    const roomId = String(req.params.id);
    const room = await repository.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const stats = await repository.getRoomStats(roomId);
    return res.json({
      participants: stats.participants,
      online: getOnlineUsersForRoomSockets(stats.participantIds),
    });
  });
}
