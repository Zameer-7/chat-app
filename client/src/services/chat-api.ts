import { api } from "@shared/routes";
import { authFetch } from "./api";

export type ChatMessage = {
  id: number;
  roomId: string | null;
  senderId: number;
  receiverId: number | null;
  status: "sent" | "delivered" | "seen";
  content: string;
  messageType?: "text" | "gif" | "image";
  gifUrl?: string | null;
  deleted?: boolean;
  edited?: boolean;
  editedAt?: string | null;
  createdAt: string;
  senderNickname: string;
  replyToId?: number | null;
  replyToContent?: string | null;
  replyToNickname?: string | null;
  reactions?: Array<{ reaction: string; count: number }>;
};

export type Friend = {
  id: number;
  email: string;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  chatTheme: "light" | "dark" | "ocean" | "midnight" | "love";
  nicknameLastChanged: string | null;
  usernameLastChanged: string | null;
  createdAt: string;
  isOnline: boolean;
  lastSeen: string;
};

export type FriendRequest = {
  id: number;
  senderId: number;
  receiverId: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  senderNickname: string;
  senderUsername: string;
  senderEmail: string;
  senderAvatarUrl?: string | null;
};

export type Room = { id: string; roomName: string | null; createdBy: number | null; createdAt: string; creatorNickname?: string | null; creatorUsername?: string | null };
export type RoomStats = { participants: number; online: number };
export type JoinedRoom = { roomId: string; joinedAt: string; leftAt: string | null; roomCreatedAt: string; createdBy: number | null; roomName: string | null };
export type RoomMember = { userId: number; nickname: string; username: string; avatarUrl: string | null; isOnline: boolean; joinedAt: string; leftAt: string | null; createdBy: number | null };

export function createRoom(roomName?: string) {
  return authFetch<Room>(api.rooms.create, { method: "POST", body: JSON.stringify({ roomName }) });
}

export function renameRoom(roomId: string, roomName: string) {
  return authFetch<{ id: string; roomName: string | null }>(api.rooms.rename(roomId), {
    method: "PUT",
    body: JSON.stringify({ roomName }),
  });
}

export function getRoomMembers(roomId: string) {
  return authFetch<RoomMember[]>(api.rooms.members(roomId));
}

export function getJoinedRooms() {
  return authFetch<JoinedRoom[]>(api.rooms.joined);
}

export function joinRoom(roomId: string) {
  return authFetch(api.rooms.join(roomId), { method: "POST" });
}

export function leaveRoom(roomId: string) {
  return authFetch<{ message: string }>(api.rooms.leave(roomId), { method: "POST" });
}

export function deleteRoom(roomId: string) {
  return authFetch<{ message: string }>(api.rooms.delete(roomId), { method: "DELETE" });
}

export function getRoom(roomId: string) {
  return authFetch<Room>(api.rooms.get(roomId));
}

export function getRoomMessages(roomId: string, before?: string) {
  const url = before
    ? `${api.rooms.messages(roomId)}?before=${encodeURIComponent(before)}`
    : api.rooms.messages(roomId);
  return authFetch<ChatMessage[]>(url);
}

export function getRoomStats(roomId: string) {
  return authFetch<RoomStats>(`/api/rooms/${roomId}/stats`);
}

export function getFriends() {
  return authFetch<Friend[]>(api.friends.list);
}

export function searchUsers(q: string) {
  const params = new URLSearchParams({ q });
  return authFetch<Friend[]>(`${api.users.search}?${params.toString()}`);
}

export function sendFriendRequest(receiverId: number) {
  return authFetch(api.friendRequests.create, {
    method: "POST",
    body: JSON.stringify({ receiverId }),
  });
}

export function getFriendRequests() {
  return authFetch<FriendRequest[]>(api.friendRequests.list);
}

export function respondToFriendRequest(id: number, status: "accepted" | "rejected") {
  return authFetch(api.friendRequests.update(id), {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getDirectMessages(friendId: number) {
  return authFetch<ChatMessage[]>(api.direct.messages(friendId));
}

export function searchMessages(query: string, roomId?: string, friendId?: number) {
  const params = new URLSearchParams({ query });
  if (roomId) params.set("roomId", roomId);
  if (friendId) params.set("friendId", String(friendId));
  return authFetch<ChatMessage[]>(`${api.messages.search}?${params.toString()}`);
}
