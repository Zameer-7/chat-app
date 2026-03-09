import { api } from "@shared/routes";
import { authFetch, type SafeUser } from "./api";

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

export function updateMyProfile(payload: { avatarUrl?: string; bio?: string }) {
  return authFetch<SafeUser>(api.profile.update, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAvatar() {
  return authFetch<SafeUser>(api.profile.deleteAvatar, {
    method: "DELETE",
  });
}
