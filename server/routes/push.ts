import type { Express } from "express";
import webpush from "web-push";
import { authMiddleware, type AuthedRequest } from "../middleware/auth";
import { repository } from "../models/repository";

// ─── VAPID initialisation ───────────────────────────────────────────────────
export const pushEnabled = !!(
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
);

if (pushEnabled) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? "hello@vibely.app"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
} else {
  console.log(
    "[push] VAPID keys not configured — background push disabled.\n" +
      "  Run: npx web-push generate-vapid-keys\n" +
      "  Then set: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL env vars."
  );
}

// ─── Helper: send push to all subscriptions of a user ──────────────────────
export async function sendPushNotification(
  userId: number,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  if (!pushEnabled) return;
  const subscriptions = await repository.getPushSubscriptions(userId);
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch (err: any) {
      // 410 Gone = subscription expired or revoked by browser
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await repository.deletePushSubscription(userId, sub.endpoint);
      }
    }
  }
}

// ─── HTTP routes ────────────────────────────────────────────────────────────
export function registerPushRoutes(app: Express) {
  // Public — clients need this to call pushManager.subscribe()
  app.get("/api/push/vapid-public-key", (_req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  });

  // Save / update a push subscription for the logged-in user
  app.post("/api/push/subscribe", authMiddleware, async (req: AuthedRequest, res) => {
    const { endpoint, p256dh, auth } = req.body ?? {};
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Missing endpoint, p256dh, or auth fields" });
    }
    await repository.savePushSubscription(
      req.user!.userId,
      String(endpoint),
      String(p256dh),
      String(auth)
    );
    return res.json({ ok: true });
  });

  // Remove a push subscription (called on logout)
  app.delete("/api/push/subscribe", authMiddleware, async (req: AuthedRequest, res) => {
    const { endpoint } = req.body ?? {};
    if (endpoint) {
      await repository.deletePushSubscription(req.user!.userId, String(endpoint));
    }
    return res.json({ ok: true });
  });
}
