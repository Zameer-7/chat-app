import type { Express } from "express";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function registerUserRoutes(app: Express) {
  // Public endpoint — no auth required so it works during signup flow
  app.get("/api/users/check-username", async (req, res) => {
    const raw = String(req.query.username || "").trim();
    const username = raw.toLowerCase();

    if (!USERNAME_REGEX.test(username)) {
      return res.json({ available: false });
    }

    const existing = await repository.getUserByUsername(username);
    return res.json({ available: !existing });
  });

  app.get("/api/users/search", authMiddleware, async (req: AuthedRequest, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.json([]);
    }

    const users = await repository.searchUsersByUsername(req.user!.userId, q);
    return res.json(users);
  });
}
