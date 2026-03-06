import type { Express } from "express";
import bcrypt from "bcryptjs";
import { loginSchema, signupSchema } from "@shared/schema";
import { repository } from "../models/repository";
import { authMiddleware, type AuthedRequest, signToken } from "../middleware/auth";

function buildToken(user: { id: number; email: string; username: string }) {
  return signToken({ userId: user.id, email: user.email, username: user.username });
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { username: rawUsername, email, password } = parsed.data;
    // Enforce lowercase to prevent case-variant duplicates (e.g. Jazz vs jazz)
    const username = rawUsername.toLowerCase();

    const existingEmail = await repository.getUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const existingUsername = await repository.getUserByUsername(username);
    if (existingUsername) {
      return res.status(409).json({
        field: "username",
        message: "Username already exists. Please choose another username.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Use the chosen username as the initial nickname
    const nickname = username;

    try {
      const user = await repository.createUser({ email, passwordHash, nickname, username });
      const token = buildToken(user);
      return res.status(201).json({ token, user });
    } catch {
      // Guard against rare race-condition where another signup claimed the same username/nickname
      return res.status(409).json({
        field: "username",
        message: "Username already exists. Please choose another username.",
      });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { email, password } = parsed.data;
    const user = await repository.getUserByEmail(email);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const safeUser = await repository.getUserById(user.id);
    if (!safeUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = buildToken(safeUser);
    return res.json({ token, user: safeUser });
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthedRequest, res) => {
    const user = await repository.getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(user);
  });

  app.post("/api/auth/logout", authMiddleware, (_req, res) => {
    return res.json({ success: true });
  });
}
