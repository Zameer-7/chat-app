import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

export function registerDirectMessageRoutes(app: Express) {
  app.get("/api/direct/:friendId/messages", authMiddleware, async (req: AuthedRequest, res) => {
    const friendId = Number(req.params.friendId);
    if (!Number.isInteger(friendId) || friendId <= 0) {
      return res.status(400).json({ message: "Invalid friend id" });
    }

    const isFriend = await repository.areFriends(req.user!.userId, friendId);
    if (!isFriend) {
      return res.status(403).json({ message: "You can only message accepted friends" });
    }

    await repository.markDirectMessagesSeen(req.user!.userId, friendId);
    const messages = await repository.listDirectMessages(req.user!.userId, friendId);
    return res.json(messages.rows);
  });
}
