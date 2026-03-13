import { api } from "@shared/routes";
import { buildApiUrl } from "@/config/api";

export type ChatTheme = "light" | "dark" | "ocean" | "midnight" | "love";

export type SafeUser = {
  id: number;
  email: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  chatTheme: ChatTheme;
  nicknameLastChanged: string | null;
  usernameLastChanged: string | null;
  createdAt: string;
  isOnline: boolean;
  lastSeen: string;
  emailVerified: boolean;
};

export type AuthResponse = { accessToken: string; user: SafeUser; redirect?: string };
export type SignupResponse = { requiresVerification: true; email: string } | AuthResponse;

const REQUEST_TIMEOUT_MS = 15000;

// ── In-memory token storage (never persisted to localStorage) ──────────────
let _accessToken: string | null = null;

export function getToken(): string | null {
  return _accessToken;
}

export function getRefreshToken(): string | null {
  // Refresh token is now stored in httpOnly cookie — not accessible from JS.
  // Return null; the refresh endpoint reads the cookie server-side.
  return null;
}

export function setToken(token: string | null) {
  _accessToken = token;
}

export function setTokens(accessToken: string, _refreshToken?: string) {
  _accessToken = accessToken;
  // refreshToken is set as httpOnly cookie by the server — no client storage needed
}

export function clearTokens() {
  _accessToken = null;
}

// Deduplicates concurrent refresh attempts
let refreshPromise: Promise<string> | null = null;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (init.signal) {
    init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshAccessToken(): Promise<string> {
  // The refresh token is sent automatically as an httpOnly cookie
  const res = await fetchWithTimeout(buildApiUrl(api.auth.refresh), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  });

  if (!res.ok) throw new Error("Refresh failed");

  const data = await res.json();
  setToken(data.accessToken);
  return data.accessToken;
}

export async function authFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json; charset=utf-8");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(buildApiUrl(url), { ...init, headers, credentials: "include" });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }

  // Avoid refresh loops for unauthenticated/public auth endpoints.
  const skipRefresh = /^\/api\/auth\/(login|signup|captcha|verify-email|resend-otp|forgot-password|verify-reset-code|reset-password)$/i.test(url);

  // Auto-refresh on 401 — refresh token is in httpOnly cookie
  if (res.status === 401 && !skipRefresh) {
    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      const newToken = await refreshPromise;
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetchWithTimeout(buildApiUrl(url), { ...init, headers, credentials: "include" });
    } catch {
      clearTokens();
      throw new Error("Session expired. Please log in again.");
    }
  }

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let message = "Request failed";
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (text.toLowerCase().includes("<!doctype html")) {
      throw new Error("API route not found on current server process. Restart dev server.");
    }
    throw new Error("Unexpected non-JSON API response");
  }

  return res.json() as Promise<T>;
}

export function signup(payload: { username: string; email: string; password: string; captchaId: string; captchaAnswer: string }) {
  return authFetch<SignupResponse>(api.auth.signup, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Upload an image for use in chat. Returns the server URL for the uploaded file. */
export async function uploadImage(file: File): Promise<{ url: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(buildApiUrl("/api/messages/upload-image"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    let message = "Upload failed";
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export function checkUsernameAvailability(username: string) {
  return authFetch<{ available: boolean }>(
    `${api.users.checkUsername}?username=${encodeURIComponent(username)}`,
  );
}

export function login(payload: { email: string; password: string; redirect?: string }) {
  return authFetch<AuthResponse>(api.auth.login, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyEmail(payload: { email: string; otp: string }) {
  return authFetch<AuthResponse>(api.auth.verifyEmail, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resendOtp(email: string) {
  return authFetch<{ success: boolean }>(api.auth.resendOtp, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function forgotPassword(email: string) {
  return authFetch<{ success: boolean }>(api.auth.forgotPassword, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyResetCode(email: string, code: string) {
  return authFetch<{ success: boolean }>(api.auth.verifyResetCode, {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return authFetch<{ success: boolean }>(api.auth.resetPassword, {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword }),
  });
}

export function getCaptcha() {
  return authFetch<{ id: string; image: string }>(api.auth.captcha);
}

export function getCurrentUser() {
  return authFetch<SafeUser>(api.auth.me);
}

export function getSettingsProfile() {
  return authFetch<SafeUser>(api.settings.profile);
}

export function updateSettingsProfile(payload: { nickname?: string; username?: string }) {
  return authFetch<SafeUser>(api.settings.updateProfile, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateSettingsTheme(chatTheme: ChatTheme) {
  return authFetch<SafeUser>(api.settings.updateTheme, {
    method: "PUT",
    body: JSON.stringify({ chatTheme }),
  });
}
