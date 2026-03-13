import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";
import { sanitizeText } from "../lib/sanitize";
import { logSecurity } from "../lib/security-logger";

export function registerMessageRoutes(app: Express) {
  // Search messages in a room or DM conversation
  app.get("/api/messages/search", authMiddleware, async (req: AuthedRequest, res) => {
    const query = String(req.query.query || "").trim();
    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const roomId = req.query.roomId ? String(req.query.roomId) : undefined;
    const friendId = req.query.friendId ? Number(req.query.friendId) : undefined;

    try {
      const results = await repository.searchMessages(query, roomId, req.user!.userId, friendId);
      return res.json(results.rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Search failed" });
    }
  });

  // Edit a message via HTTP (alternative to WS)
  app.put("/api/messages/:id/edit", authMiddleware, async (req: AuthedRequest, res) => {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ message: "Invalid message id" });
    }
    const rawContent = String(req.body?.message || req.body?.content || "").trim();
    const content = sanitizeText(rawContent);
    if (content !== rawContent) {
      logSecurity("SCRIPT_INJECTION", { route: "/api/messages/:id/edit", userId: req.user!.userId });
    }
    if (!content) {
      return res.status(400).json({ message: "Message content is required" });
    }

    try {
      const updated = await repository.editMessage(messageId, req.user!.userId, content);
      if (!updated) return res.status(404).json({ message: "Message not found" });
      return res.json(updated);
    } catch (err: any) {
      return res.status(err.status || 400).json({ message: err.message || "Failed to edit message" });
    }
  });
}
