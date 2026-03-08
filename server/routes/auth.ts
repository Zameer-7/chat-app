import type { Express } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { loginSchema, signupSchema } from "@shared/schema";
import { repository } from "../models/repository";
import { authMiddleware, type AuthedRequest, signToken } from "../middleware/auth";
import { generateOtp, sendOtpEmail } from "../services/email";

function buildToken(user: { id: number; email: string; username: string }) {
  return signToken({ userId: user.id, email: user.email, username: user.username });
}

const OTP_EXPIRY_MINUTES = 10;

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { message: "Too many signup attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const resendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3,
  message: { message: "Too many resend attempts. Please wait before requesting a new code." },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: "Too many verification attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", signupLimiter, async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { username: rawUsername, email, password, captchaToken } = parsed.data;
    const username = rawUsername.toLowerCase();

    // Verify Cloudflare Turnstile CAPTCHA
    if (process.env.TURNSTILE_SECRET) {
      try {
        const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET, response: captchaToken }),
        });
        const cfData = await cfRes.json() as { success: boolean };
        if (!cfData.success) {
          return res.status(400).json({ message: "Captcha verification failed. Please try again." });
        }
      } catch {
        return res.status(500).json({ message: "Captcha verification service unavailable. Please try again later." });
      }
    }

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
    const nickname = username;

    try {
      const user = await repository.createUser({ email, passwordHash, nickname, username });

      // Generate and store OTP
      const otp = generateOtp();
      const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
      await repository.setEmailOtp(user.id, otp, expiry);

      // Send verification email (don't block signup on email failure)
      try {
        await sendOtpEmail(email, otp);
      } catch (emailErr) {
        console.error("Failed to send OTP email:", emailErr);
      }

      return res.status(201).json({ requiresVerification: true, email });
    } catch {
      return res.status(409).json({
        field: "username",
        message: "Username already exists. Please choose another username.",
      });
    }
  });

  app.post("/api/auth/verify-email", verifyLimiter, async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await repository.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    if (!user.emailOtp || !user.otpExpiry) {
      return res.status(400).json({ message: "No verification code found. Please request a new one." });
    }

    if (new Date() > new Date(user.otpExpiry)) {
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }

    if (user.emailOtp !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    await repository.verifyEmail(user.id);

    const safeUser = await repository.getUserById(user.id);
    if (!safeUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = buildToken(safeUser);
    return res.json({ token, user: safeUser });
  });

  app.post("/api/auth/resend-otp", resendLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await repository.getUserByEmail(email);
    if (!user) {
      // Don't reveal whether the email exists
      return res.json({ success: true });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const otp = generateOtp();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await repository.setEmailOtp(user.id, otp, expiry);

    try {
      await sendOtpEmail(email, otp);
    } catch (emailErr) {
      console.error("Failed to send OTP email:", emailErr);
    }

    return res.json({ success: true });
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

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        requiresVerification: true,
        email: user.email,
      });
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
