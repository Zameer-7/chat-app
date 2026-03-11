import type { Express } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { loginSchema, signupSchema, users } from "@shared/schema";
import { db, pool } from "../db";
import { repository } from "../models/repository";
import { authMiddleware, type AuthedRequest, signAccessToken, signRefreshToken, verifyRefreshToken } from "../middleware/auth";
import { generateOtp, sendOtpEmail, sendPasswordResetEmail, isEmailConfigured } from "../services/email";

function buildTokens(user: { id: number; email: string; username: string }) {
  const payload = { userId: user.id, email: user.email, username: user.username };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

// ── Word CAPTCHA ──────────────────────────────────────────
const CAPTCHA_WORDS = [
  // Nature & weather
  "sunshine", "mountain", "rainbow", "thunder", "breeze",
  "forest", "river", "meadow", "ocean", "garden",
  "valley", "island", "desert", "glacier", "volcano",
  "canyon", "waterfall", "sunrise", "sunset", "blizzard",
  "tornado", "monsoon", "aurora", "eclipse", "horizon",
  "lagoon", "prairie", "tundra", "savanna", "reef",
  // Animals
  "dolphin", "phoenix", "falcon", "panther", "tiger",
  "penguin", "parrot", "jaguar", "cheetah", "mustang",
  "buffalo", "sparrow", "condor", "lobster", "gazelle",
  "leopard", "pelican", "rooster", "hamster", "giraffe",
  "octopus", "peacock", "raccoon", "seahorse", "walrus",
  // Space & science
  "galaxy", "planet", "rocket", "nebula", "comet",
  "neutron", "quasar", "photon", "pulsar", "meteor",
  "cosmos", "gravity", "stellar", "orbital", "plasma",
  // Objects & places
  "crystal", "castle", "temple", "harbor", "bridge",
  "lantern", "compass", "anchor", "beacon", "helmet",
  "shield", "trophy", "marble", "candle", "banner",
  "puzzle", "ticket", "basket", "pillar", "ribbon",
  "mirror", "fountain", "chimney", "curtain", "blanket",
  // Colors & gems
  "violet", "silver", "golden", "scarlet", "crimson",
  "indigo", "emerald", "topaz", "cobalt", "bronze",
  "copper", "maroon", "ivory", "onyx", "sapphire",
  // Food & drink
  "mango", "waffle", "pretzel", "cherry", "walnut",
  "almond", "ginger", "pepper", "butter", "cookie",
  "muffin", "noodle", "pickle", "turnip", "coconut",
  "papaya", "apricot", "cashew", "biscuit", "custard",
  // Actions & abstract
  "shadow", "spirit", "voyage", "wander", "summit",
  "ripple", "flicker", "shimmer", "whisper", "dazzle",
  "tumble", "flutter", "crackle", "sparkle", "thunder",
  "rumble", "breaker", "sprinter", "climber", "juggler",
  // Music & art
  "melody", "rhythm", "canvas", "sketch", "sculpt",
  "stanza", "chorus", "sonnet", "lyric", "ballad",
  // Misc fun words
  "wizard", "knight", "pirate", "viking", "ninja",
  "samurai", "legend", "cipher", "riddle", "mystic",
  "voyager", "pioneer", "crusader", "outlaw", "nomad",
  "captain", "jester", "oracle", "sentinel", "phantom",
  // More words — buildings & vehicles
  "fortress", "mansion", "cottage", "highway", "tunnel",
  "railway", "trolley", "scooter", "tanker", "blimp",
  "chariot", "gondola", "frigate", "kayak", "trailer",
  // Professions & people
  "surgeon", "chemist", "sculptor", "plumber", "barista",
  "rancher", "aviator", "sheriff", "marshal", "gladiator",
  // Fabrics & materials
  "velvet", "denim", "cotton", "granite", "bamboo",
  "ceramic", "lumber", "platinum", "titanium", "kevlar",
  // Plants & trees
  "orchid", "cactus", "bamboo", "jasmine", "sequoia",
  "willow", "cypress", "thistle", "clover", "hibiscus",
  // Tools & tech
  "hammer", "wrench", "chisel", "gadget", "modem",
  "router", "laptop", "scanner", "turbine", "dynamo",
  // Sports & games
  "striker", "sprinter", "trophy", "javelin", "hurdle",
  "archery", "cricket", "bowling", "fencing", "lacrosse",
  // Emotions & traits
  "courage", "wisdom", "harmony", "triumph", "resolve",
  "valor", "patience", "tenacity", "devotion", "ambition",
  // Clothing & accessories
  "sandal", "bonnet", "turban", "mitten", "buckle",
  "pendant", "brooch", "locket", "bracelet", "anklet",
  // Instruments & sounds
  "trumpet", "cymbal", "fiddle", "banjo", "ukulele",
  "timpani", "maracas", "chime", "gong", "siren",
  // Random letter combos (anti-bot)
  "xbmtv", "qzrfw", "jnkpd", "hvlcg", "wytmx",
  "dprkz", "fnbjq", "gxlvs", "mkrcw", "pzhdt",
  "bvnxf", "cjwmr", "tqzgk", "xlpfn", "rhdwb",
  "kfmtj", "zvncx", "wbqrk", "gjptl", "nxdsf",
  "lrvbz", "ykcmw", "hdqpn", "btfxj", "mpgzr",
  "fwknd", "qjxlv", "shbtp", "cmrzg", "vnkdf",
  "xrptm", "jlbwf", "dgnkz", "kvhcx", "tzmrq",
  "bxfwp", "njqrk", "gdvlm", "pxhcf", "wtnbz",
  "rjkvm", "fxdqn", "lzhpw", "ctbjg", "mkxvr",
  "qnwft", "hbzpd", "vjcmx", "gkrln", "xftwb",
  // Alphanumeric combos (anti-bot)
  "rt457fh", "k3m9xp", "w8dn2q", "p5vt7j", "b6nf3r",
  "x2hk9m", "j7qw4c", "d9lp6v", "g4rx8n", "f3mt5z",
  "n8kv2d", "t6px9h", "c5wj7b", "m2rg4f", "v7nd3k",
  "h9xt6p", "q4fm8w", "z3kn5r", "r6pd2j", "w5bx7g",
  "l8tv4m", "j2nk9f", "p7hd3c", "x6mw5t", "g9rq4v",
];

const CAPTCHA_SECRET = process.env.JWT_SECRET || "vibely-captcha-secret";
const CAPTCHA_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function createCaptchaChallenge() {
  const word = CAPTCHA_WORDS[crypto.randomInt(CAPTCHA_WORDS.length)];
  const id = crypto.randomUUID();
  const expiry = Date.now() + CAPTCHA_EXPIRY_MS;
  const signature = crypto
    .createHmac("sha256", CAPTCHA_SECRET)
    .update(`${id}:${word.toLowerCase()}:${expiry}`)
    .digest("hex");
  const image = generateCaptchaSvg(word);
  return { id, image, expiry, signature };
}

function generateCaptchaSvg(text: string): string {
  const width = 200;
  const height = 70;
  const chars = text.split("");

  // Random integer helper
  const ri = (min: number, max: number) => crypto.randomInt(min, max + 1);

  // Random muted colors for characters
  const colors = ["#2d3748", "#4a5568", "#1a365d", "#2c5282", "#2b6cb0", "#553c9a", "#6b46c1", "#9b2c2c", "#c05621", "#2f855a"];

  // Build noise lines
  let noiseLines = "";
  for (let i = 0; i < 6; i++) {
    const x1 = ri(0, width);
    const y1 = ri(0, height);
    const x2 = ri(0, width);
    const y2 = ri(0, height);
    const color = colors[ri(0, colors.length - 1)];
    noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${ri(1, 2)}" opacity="0.3"/>`;
  }

  // Build noise dots
  let noiseDots = "";
  for (let i = 0; i < 30; i++) {
    const cx = ri(0, width);
    const cy = ri(0, height);
    const color = colors[ri(0, colors.length - 1)];
    noiseDots += `<circle cx="${cx}" cy="${cy}" r="${ri(1, 3)}" fill="${color}" opacity="0.25"/>`;
  }

  // Build distorted characters
  const spacing = width / (chars.length + 1);
  let charElements = "";
  for (let i = 0; i < chars.length; i++) {
    const x = spacing * (i + 1) + ri(-5, 5);
    const y = height / 2 + ri(-8, 8);
    const rotate = ri(-25, 25);
    const fontSize = ri(24, 32);
    const color = colors[ri(0, colors.length - 1)];
    const fonts = ["monospace", "serif", "sans-serif", "Georgia", "Courier"];
    const font = fonts[ri(0, fonts.length - 1)];
    charElements += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="${font}" font-weight="bold" fill="${color}" transform="rotate(${rotate},${x},${y})" dominant-baseline="central" text-anchor="middle">${chars[i].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
  }

  // Wavy path for extra distortion
  const waveY = ri(20, 50);
  const wavePath = `<path d="M0,${waveY} Q${ri(30, 70)},${ri(0, height)} ${ri(90, 120)},${waveY} T${width},${ri(20, 50)}" stroke="${colors[ri(0, colors.length - 1)]}" fill="none" stroke-width="1.5" opacity="0.3"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f0f0f0" rx="8"/>${noiseLines}${noiseDots}${wavePath}${charElements}</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function verifyCaptcha(id: string, answer: string, signature: string, expiry: number): boolean {
  if (Date.now() > expiry) return false;
  const expected = crypto
    .createHmac("sha256", CAPTCHA_SECRET)
    .update(`${id}:${answer.toLowerCase()}:${expiry}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// In-memory store for active captcha challenges (id → {signature, expiry})
const captchaStore = new Map<string, { signature: string; expiry: number }>();

// Clean up expired captchas every 5 min
setInterval(() => {
  const now = Date.now();
  captchaStore.forEach((entry, id) => {
    if (now > entry.expiry) captchaStore.delete(id);
  });
}, 5 * 60 * 1000);

const OTP_EXPIRY_MINUTES = 10;

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
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
  // ── Generate CAPTCHA challenge ──
  app.get("/api/auth/captcha", (_req, res) => {
    const challenge = createCaptchaChallenge();
    captchaStore.set(challenge.id, { signature: challenge.signature, expiry: challenge.expiry });
    return res.json({ id: challenge.id, image: challenge.image });
  });

  app.post("/api/auth/signup", signupLimiter, async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { username: rawUsername, email, password, captchaId, captchaAnswer } = parsed.data;
    const username = rawUsername.toLowerCase();

    // Verify word CAPTCHA
    const stored = captchaStore.get(captchaId);
    if (!stored) {
      return res.status(400).json({ message: "Captcha expired or invalid. Please refresh and try again." });
    }
    captchaStore.delete(captchaId); // Single-use
    if (!verifyCaptcha(captchaId, captchaAnswer, stored.signature, stored.expiry)) {
      return res.status(400).json({ message: "Incorrect captcha. Please try again." });
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

    const passwordHash = await bcrypt.hash(password, 12);
    const nickname = username;

    try {
      const user = await repository.createUser({ email, passwordHash, nickname, username });

      // If email service is configured, require OTP verification
      if (isEmailConfigured) {
        const otp = generateOtp();
        const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        await repository.setEmailOtp(user.id, otp, expiry);

        try {
          await sendOtpEmail(email, otp);
        } catch (emailErr) {
          console.error("Failed to send OTP email:", emailErr);
        }

        return res.status(201).json({ requiresVerification: true, email });
      }

      // Email service not configured — auto-verify and return token
      await repository.verifyEmail(user.id);
      const safeUser = await repository.getUserById(user.id);
      const tokens = buildTokens(safeUser!);
      return res.status(201).json({ ...tokens, user: safeUser });
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

    const tokens = buildTokens(safeUser);
    return res.json({ ...tokens, user: safeUser });
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

  // ── Login brute force protection ───────────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { message: "Too many login attempts. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
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
      // Only block login if email service is actually configured
      if (isEmailConfigured) {
        return res.status(403).json({
          message: "Please verify your email before logging in.",
          requiresVerification: true,
          email: user.email,
        });
      }
      // Auto-verify if email service was not configured when they signed up
      await repository.verifyEmail(user.id);
    }

    const safeUser = await repository.getUserById(user.id);
    if (!safeUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const tokens = buildTokens(safeUser);
    return res.json({ ...tokens, user: safeUser });
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

  // ── Refresh Token ──────────────────────────────────────────
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: "Too many refresh attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post("/api/auth/refresh", refreshLimiter, async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== "string") {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await repository.getUserById(payload.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const accessToken = signAccessToken({ userId: user.id, email: user.email, username: user.username });
      return res.json({ accessToken });
    } catch {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
  });

  // ── Forgot Password ────────────────────────────────────────
  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { message: "Too many reset attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const resetCodeVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }

    // Always return success (don't reveal if email exists)
    const user = await repository.getUserByEmail(email);
    if (!user) {
      return res.json({ success: true });
    }

    if (!isEmailConfigured) {
      return res.status(503).json({ message: "Email service is not configured" });
    }

    // Delete any existing reset codes for this user
    await pool.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);

    // Generate and store a new code
    const code = crypto.randomInt(100000, 999999).toString();
    await pool.query(
      "INSERT INTO password_resets (user_id, reset_code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')",
      [user.id, code]
    );

    try {
      await sendPasswordResetEmail(email, code);
    } catch (err) {
      console.error("Failed to send reset email:", err);
    }

    return res.json({ success: true });
  });

  app.post("/api/auth/verify-reset-code", resetCodeVerifyLimiter, async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const user = await repository.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    const result = await pool.query(
      "SELECT * FROM password_resets WHERE user_id = $1 AND reset_code = $2 AND expires_at > NOW()",
      [user.id, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    return res.json({ success: true });
  });

  app.post("/api/auth/reset-password", resetCodeVerifyLimiter, async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Email, code, and new password are required" });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await repository.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    // Verify the code is still valid
    const result = await pool.query(
      "SELECT * FROM password_resets WHERE user_id = $1 AND reset_code = $2 AND expires_at > NOW()",
      [user.id, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    // Hash and update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    // Delete all reset codes for this user
    await pool.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);

    return res.json({ success: true });
  });
}
