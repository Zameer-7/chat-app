import { api } from "@shared/routes";
import { buildApiUrl } from "@/config/api";

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  message: string;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export async function getNotifications(): Promise<AppNotification[]> {
  const res = await fetch(buildApiUrl(api.notifications.list), { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
}

export async function getUnreadNotificationCount(): Promise<number> {
  const res = await fetch(buildApiUrl(api.notifications.unreadCount), { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch notification count");
  const data = await res.json();
  return data.count;
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  const res = await fetch(buildApiUrl(api.notifications.markRead(id)), {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to mark notification read");
  return res.json();
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(buildApiUrl(api.notifications.markAllRead), {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to mark all read");
}
