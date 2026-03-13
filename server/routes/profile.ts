import type { Express } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { updateProfileMetaSchema } from "@shared/schema";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";
import { sanitizeText } from "../lib/sanitize";
import { logSecurity } from "../lib/security-logger";

// Simple in-memory profile cache (userId → { data, expiry })
const profileCache = new Map<number, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 15_000; // 15 seconds
const UPLOADS_DIR = path.resolve("uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const extByMime: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
      };
      const ext = extByMime[file.mimetype] || ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, JPEG, PNG, and WebP images are allowed"));
    }
  },
});

export function invalidateProfileCache(userId: number) {
  profileCache.delete(userId);
}

export function registerProfileRoutes(app: Express) {
  app.post("/api/profile/upload-avatar", authMiddleware, (req: AuthedRequest, res) => {
    avatarUpload.single("avatar")(req, res, (err: any) => {
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Image must be smaller than 5 MB" });
      }
      if (err) {
        return res.status(400).json({ message: err.message || "Avatar upload failed" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const avatarPath = `/uploads/${req.file.filename}`;
      return res.json({ avatarPath });
    });
  });

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

    const sanitized: { avatarPath?: string; bio?: string } = {};

    // Only allow internal uploaded avatar paths
    const avatarPath = parsed.data.avatarPath ?? parsed.data.avatarUrl;
    if (avatarPath !== undefined) {
      if (avatarPath === "") {
        sanitized.avatarPath = "";
      } else if (/^\/uploads\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(avatarPath)) {
        sanitized.avatarPath = avatarPath;
      } else {
        logSecurity("SUSPICIOUS_INPUT", { field: "avatarPath", userId: req.user!.userId, reason: "external_or_invalid_avatar_path" });
        return res.status(400).json({ message: "Profile image must be a Vibely uploaded JPG, JPEG, PNG, or WebP file." });
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
    const updated = await repository.updateProfileMeta(req.user!.userId, { avatarPath: "" });
    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }
    invalidateProfileCache(req.user!.userId);
    return res.json(updated);
  });
}
