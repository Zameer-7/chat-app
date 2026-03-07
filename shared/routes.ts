export const api = {
  auth: {
    signup: "/api/auth/signup",
    login: "/api/auth/login",
    me: "/api/auth/me",
    logout: "/api/auth/logout",
  },
  users: {
    search: "/api/users/search",
    checkUsername: "/api/users/check-username",
  },
  messages: {
    uploadImage: "/api/messages/upload-image",
    search: "/api/messages/search",
    edit: (id: number) => `/api/messages/${id}/edit`,
  },
  friends: {
    list: "/api/friends",
  },
  friendRequests: {
    list: "/api/friend-requests",
    count: "/api/friend-requests/count",
    create: "/api/friend-requests",
    update: (id: number) => `/api/friend-requests/${id}`,
  },
  rooms: {
    create: "/api/rooms",
    joined: "/api/rooms/joined",
    join: (id: string) => `/api/rooms/${id}/join`,
    leave: (id: string) => `/api/rooms/${id}/leave`,
    delete: (id: string) => `/api/rooms/${id}`,
    get: (id: string) => `/api/rooms/${id}`,
    rename: (id: string) => `/api/rooms/${id}`,
    messages: (id: string) => `/api/rooms/${id}/messages`,
    members: (id: string) => `/api/rooms/${id}/members`,
    stats: (id: string) => `/api/rooms/${id}/stats`,
  },
  direct: {
    messages: (friendId: number) => `/api/direct/${friendId}/messages`,
    deleteChat: (friendId: number) => `/api/direct/${friendId}/delete-chat`,
  },
  chatSettings: {
    get: "/api/chat-settings",
    archive: "/api/chat-settings/archive",
    unarchive: "/api/chat-settings/unarchive",
    mute: "/api/chat-settings/mute",
    unmute: "/api/chat-settings/unmute",
  },
  bulkMessages: {
    delete: "/api/messages/bulk-delete",
  },
  profile: {
    me: "/api/profile/me",
    update: "/api/profile/update",
  },
  settings: {
    profile: "/api/settings/profile",
    updateProfile: "/api/settings/update-profile",
    updateTheme: "/api/settings/update-theme",
  },
  push: {
    vapidPublicKey: "/api/push/vapid-public-key",
    subscribe: "/api/push/subscribe",
  },
} as const;

export const wsPaths = {
  room: (roomId: string, token: string) => `/ws/room/${roomId}?token=${encodeURIComponent(token)}`,
  direct: (friendId: number, token: string) => `/ws/direct/${friendId}?token=${encodeURIComponent(token)}`,
  user: (token: string) => `/ws/user?token=${encodeURIComponent(token)}`,
};
