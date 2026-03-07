import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";
import { emitToUser } from "../websocket/notifier";

export function registerChatSettingsRoutes(app: Express) {
  // Get all chat settings for the current user
  app.get("/api/chat-settings", authMiddleware, async (req: AuthedRequest, res) => {
    const settings = await repository.getChatSettings(req.user!.userId);
    return res.json(settings);
  });

  // Archive a chat
  app.post("/api/chat-settings/archive", authMiddleware, async (req: AuthedRequest, res) => {
    const { roomId, friendId } = req.body || {};
    if (!roomId && !friendId) return res.status(400).json({ message: "roomId or friendId required" });

    const setting = await repository.upsertChatSetting(
      req.user!.userId,
      { roomId: roomId || undefined, friendId: friendId ? Number(friendId) : undefined },
      { archived: true },
    );
    emitToUser(req.user!.userId, { type: "chat_archived", roomId, friendId, archived: true });
    return res.json(setting);
  });

  // Unarchive a chat
  app.post("/api/chat-settings/unarchive", authMiddleware, async (req: AuthedRequest, res) => {
    const { roomId, friendId } = req.body || {};
    if (!roomId && !friendId) return res.status(400).json({ message: "roomId or friendId required" });

    const setting = await repository.upsertChatSetting(
      req.user!.userId,
      { roomId: roomId || undefined, friendId: friendId ? Number(friendId) : undefined },
      { archived: false },
    );
    emitToUser(req.user!.userId, { type: "chat_unarchived", roomId, friendId, archived: false });
    return res.json(setting);
  });

  // Mute a chat
  app.post("/api/chat-settings/mute", authMiddleware, async (req: AuthedRequest, res) => {
    const { roomId, friendId, duration } = req.body || {};
    if (!roomId && !friendId) return res.status(400).json({ message: "roomId or friendId required" });

    let muteUntil: Date | null = null;
    if (duration === "1h") muteUntil = new Date(Date.now() + 60 * 60 * 1000);
    else if (duration === "8h") muteUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
    else if (duration === "1w") muteUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // "forever" => muteUntil stays null but muted = true

    const setting = await repository.upsertChatSetting(
      req.user!.userId,
      { roomId: roomId || undefined, friendId: friendId ? Number(friendId) : undefined },
      { muted: true, muteUntil },
    );
    emitToUser(req.user!.userId, { type: "chat_muted", roomId, friendId, muted: true, muteUntil });
    return res.json(setting);
  });

  // Unmute a chat
  app.post("/api/chat-settings/unmute", authMiddleware, async (req: AuthedRequest, res) => {
    const { roomId, friendId } = req.body || {};
    if (!roomId && !friendId) return res.status(400).json({ message: "roomId or friendId required" });

    const setting = await repository.upsertChatSetting(
      req.user!.userId,
      { roomId: roomId || undefined, friendId: friendId ? Number(friendId) : undefined },
      { muted: false, muteUntil: null },
    );
    emitToUser(req.user!.userId, { type: "chat_unmuted", roomId, friendId, muted: false });
    return res.json(setting);
  });

  // Bulk delete messages
  app.post("/api/messages/bulk-delete", authMiddleware, async (req: AuthedRequest, res) => {
    const { messageIds, scope } = req.body || {};
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "messageIds array required" });
    }
    if (messageIds.length > 100) {
      return res.status(400).json({ message: "Cannot delete more than 100 messages at once" });
    }

    const ids = messageIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return res.status(400).json({ message: "No valid message ids" });

    if (scope === "everyone") {
      const deleted = await repository.bulkDeleteMessagesForEveryone(ids, req.user!.userId);
      // Broadcast deletion to affected rooms/DMs
      for (const msg of deleted) {
        const payload = { type: "message_deleted", scope: "everyone", messageId: msg.id, userId: req.user!.userId };
        if (msg.roomId) {
          const { broadcastToRoom } = await import("../websocket/index");
          broadcastToRoom(msg.roomId, payload);
        } else {
          emitToUser(msg.senderId, payload);
          if (msg.receiverId) emitToUser(msg.receiverId, payload);
        }
      }
      return res.json({ deleted: deleted.length });
    }

    // Default: delete for me
    await repository.bulkDeleteMessagesForMe(ids, req.user!.userId);
    emitToUser(req.user!.userId, { type: "messages_hidden", messageIds: ids });
    return res.json({ hidden: ids.length });
  });

  // Delete entire DM conversation (for current user)
  app.delete("/api/direct/:friendId/delete-chat", authMiddleware, async (req: AuthedRequest, res) => {
    const friendId = Number(req.params.friendId);
    if (!Number.isInteger(friendId) || friendId <= 0) {
      return res.status(400).json({ message: "Invalid friend id" });
    }
    await repository.deleteDirectChat(req.user!.userId, friendId);
    emitToUser(req.user!.userId, { type: "chat_deleted", friendId });
    return res.json({ message: "Chat deleted" });
  });
}
