import { api } from "@shared/routes";
import { buildApiUrl } from "@/config/api";
import { authFetch, getToken, type SafeUser } from "./api";

export type ProfileResponse = {
  username: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  chatTheme: string;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
  friendCount: number;
  roomCount: number;
};

export function getMyProfile() {
  return authFetch<ProfileResponse>(api.profile.me);
}

export function updateMyProfile(payload: { avatarPath?: string; bio?: string }) {
  return authFetch<SafeUser>(api.profile.update, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function uploadAvatar(file: File): Promise<{ avatarPath: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append("avatar", file);

  const res = await fetch(buildApiUrl(api.profile.uploadAvatar), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    let message = "Avatar upload failed";
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.json();
}

export function deleteAvatar() {
  return authFetch<SafeUser>(api.profile.deleteAvatar, {
    method: "DELETE",
  });
}
