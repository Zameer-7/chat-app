import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

const UPLOADS_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPEG, and GIF images are allowed"));
    }
  },
});

export function registerDirectMessageRoutes(app: Express) {
  // Shared image upload endpoint — used by both rooms and DMs
  app.post("/api/messages/upload-image", authMiddleware, (req: AuthedRequest, res) => {
    upload.single("image")(req, res, (err: any) => {
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Image must be smaller than 5 MB" });
      }
      if (err) {
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const url = `/uploads/${req.file.filename}`;
      return res.json({ url });
    });
  });

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
