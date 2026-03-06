import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

export function registerUserRoutes(app: Express) {
  app.get("/api/users/search", authMiddleware, async (req: AuthedRequest, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.json([]);
    }

    const users = await repository.searchUsersByUsername(req.user!.userId, q);
    return res.json(users);
  });
}
