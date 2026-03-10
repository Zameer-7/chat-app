import type { Express } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { loginSchema, signupSchema } from "@shared/schema";
import { repository } from "../models/repository";
import { authMiddleware, type AuthedRequest, signToken } from "../middleware/auth";
import { generateOtp, sendOtpEmail, isEmailConfigured } from "../services/email";

function buildToken(user: { id: number; email: string; username: string }) {
  return signToken({ userId: user.id, email: user.email, username: user.username });
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
  return { id, word, expiry, signature };
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
    return res.json({ id: challenge.id, word: challenge.word });
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

    const passwordHash = await bcrypt.hash(password, 10);
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
      const token = buildToken(safeUser!);
      return res.status(201).json({ token, user: safeUser });
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
