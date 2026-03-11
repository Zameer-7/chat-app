import type { Express } from "express";
import { updateProfileMetaSchema } from "@shared/schema";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";
import { sanitizeText } from "../lib/sanitize";
import { logSecurity } from "../lib/security-logger";

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

    const sanitized: { avatarUrl?: string; bio?: string } = {};

    // SECTION 4: Only allow base64 data URLs or empty string (delete) for avatars
    if (parsed.data.avatarUrl !== undefined) {
      const avatar = parsed.data.avatarUrl;
      if (avatar === "") {
        sanitized.avatarUrl = "";
      } else if (/^data:image\/(jpeg|jpg|png|webp);base64,/.test(avatar)) {
        sanitized.avatarUrl = avatar;
      } else {
        logSecurity("SUSPICIOUS_INPUT", { field: "avatarUrl", userId: req.user!.userId, reason: "external_url_blocked" });
        return res.status(400).json({ message: "Only uploaded images (JPEG, PNG, WebP) are allowed as profile pictures." });
      }
    }

    if (parsed.data.bio !== undefined) {
      sanitized.bio = sanitizeText(parsed.data.bio);
    }

    const updated = await repository.updateProfileMeta(req.user!.userId, sanitized);
    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    invalidateProfileCache(req.user!.userId);
    return res.json(updated);
  });

  app.delete("/api/profile/avatar", authMiddleware, async (req: AuthedRequest, res) => {
    const updated = await repository.updateProfileMeta(req.user!.userId, { avatarUrl: "" });
    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }
    invalidateProfileCache(req.user!.userId);
    return res.json(updated);
  });
}
