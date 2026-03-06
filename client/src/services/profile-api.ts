import { api } from "@shared/routes";
import { authFetch, type SafeUser } from "./api";

export type ProfileResponse = SafeUser & {
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
