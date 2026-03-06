import type { Express } from "express";
import { updateProfileMetaSchema } from "@shared/schema";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

export function registerProfileRoutes(app: Express) {
  app.get("/api/profile/me", authMiddleware, async (req: AuthedRequest, res) => {
    const profile = await repository.getProfileOverview(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ message: "User not found" });
    }
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

    return res.json(updated);
  });
}
