import type { Express } from "express";
import { updateProfileSchema, updateThemeSchema } from "@shared/schema";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

export function registerSettingsRoutes(app: Express) {
  app.get("/api/settings/profile", authMiddleware, async (req: AuthedRequest, res) => {
    const user = await repository.getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(user);
  });

  app.put("/api/settings/update-profile", authMiddleware, async (req: AuthedRequest, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    if (!parsed.data.nickname && !parsed.data.username) {
      return res.status(400).json({ message: "Provide nickname or username to update" });
    }

    try {
      const updated = await repository.updateProfile(req.user!.userId, parsed.data);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }
  });

  app.put("/api/settings/update-theme", authMiddleware, async (req: AuthedRequest, res) => {
    const parsed = updateThemeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const updated = await repository.updateTheme(req.user!.userId, parsed.data.chatTheme);
    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(updated);
  });
}
