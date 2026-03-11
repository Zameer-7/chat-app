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

export type AuthResponse = { accessToken: string; refreshToken: string; user: SafeUser };
export type SignupResponse = { requiresVerification: true; email: string } | AuthResponse;

const TOKEN_KEY = "chat_app_token";
const REFRESH_TOKEN_KEY = "chat_app_refresh_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Deduplicates concurrent refresh attempts
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");

  const res = await fetch(buildApiUrl(api.auth.refresh), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
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

  let res = await fetch(buildApiUrl(url), { ...init, headers });

  // Auto-refresh on 401 if we have a refresh token
  if (res.status === 401 && getRefreshToken()) {
    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      const newToken = await refreshPromise;
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(buildApiUrl(url), { ...init, headers });
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

export function login(payload: { email: string; password: string }) {
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
