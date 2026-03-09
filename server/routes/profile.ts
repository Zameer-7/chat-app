import type { Express } from "express";
import { updateProfileMetaSchema } from "@shared/schema";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

// Simple in-memory profile cache (userId → { data, expiry })
const profileCache = new Map<number, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 15_000; // 15 seconds

export function invalidateProfileCache(userId: number) {
  profileCache.delete(userId);
}

export function registerProfileRoutes(app: Express) {
  app.get("/api/profile/me", authMiddleware, async (req: AuthedRequest, res) => {
    const userId = req.user!.userId;
    const now = Date.now();
    const cached = profileCache.get(userId);
    if (cached && cached.expiry > now) {
      return res.json(cached.data);
    }

    const profile = await repository.getProfileOverview(userId);
    if (!profile) {
      return res.status(404).json({ message: "User not found" });
    }

    profileCache.set(userId, { data: profile, expiry: now + CACHE_TTL_MS });
    return res.json(profile);
  });

  app.put("/api/profile/update", authMiddleware, async (req: AuthedRequest, res) => {
    const parsed = updateProfileMetaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const updated = await repository.updateProfileMeta(req.user!.userId, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    invalidateProfileCache(req.user!.userId);
    return res.json(updated);
  });
}
