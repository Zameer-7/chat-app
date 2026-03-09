import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

export function registerNotificationRoutes(app: Express) {
  // GET /api/notifications — list recent notifications
  app.get("/api/notifications", authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const notifs = await repository.getNotifications(req.user!.userId);
      return res.json(notifs);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // GET /api/notifications/unread-count — badge count
  app.get("/api/notifications/unread-count", authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const count = await repository.getUnreadNotificationCount(req.user!.userId);
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // PATCH /api/notifications/:id/read — mark one as read
  app.patch("/api/notifications/:id/read", authMiddleware, async (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid notification id" });
      }
      const updated = await repository.markNotificationRead(id, req.user!.userId);
      if (!updated) return res.status(404).json({ message: "Not found" });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update notification" });
    }
  });

  // POST /api/notifications/read-all — mark all as read
  app.post("/api/notifications/read-all", authMiddleware, async (req: AuthedRequest, res) => {
    try {
      await repository.markAllNotificationsRead(req.user!.userId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update notifications" });
    }
  });
}
