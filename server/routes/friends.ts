import type { Express } from "express";
import { sendFriendRequestSchema, updateFriendRequestSchema } from "@shared/schema";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";
import { emitToUser } from "../websocket/notifier";

export function registerFriendRoutes(app: Express) {
  app.get("/api/friends", authMiddleware, async (req: AuthedRequest, res) => {
    const friends = await repository.listFriends(req.user!.userId);
    return res.json(friends.rows);
  });

  app.get("/api/friend-requests", authMiddleware, async (req: AuthedRequest, res) => {
    const requests = await repository.listIncomingFriendRequests(req.user!.userId);
    return res.json(requests.rows);
  });

  app.get("/api/friend-requests/count", authMiddleware, async (req: AuthedRequest, res) => {
    const requests = await repository.listIncomingFriendRequests(req.user!.userId);
    return res.json({ count: requests.rows.length });
  });

  app.post("/api/friend-requests", authMiddleware, async (req: AuthedRequest, res) => {
    const parsed = sendFriendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { receiverId } = parsed.data;

    if (receiverId === req.user!.userId) {
      return res.status(400).json({ message: "You cannot send a friend request to yourself" });
    }

    try {
      const request = await repository.createFriendRequest(req.user!.userId, receiverId);
      emitToUser(receiverId, {
        type: "friend_request_received",
        request,
      });
      return res.status(201).json(request);
    } catch (error) {
      if ((error as any)?.code === "23505") {
        return res.status(400).json({ message: "Friend request already sent" });
      }
      return res.status(400).json({ message: (error as Error).message });
    }
  });

  app.patch("/api/friend-requests/:id", authMiddleware, async (req: AuthedRequest, res) => {
    const parsed = updateFriendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const updated = await repository.updateFriendRequestStatus(id, req.user!.userId, parsed.data.status);
    if (!updated) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    return res.json(updated);
  });
}
