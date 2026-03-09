import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { wsPaths } from "@shared/routes";
import { useAuth } from "./use-auth";
import { useSocket } from "./use-socket";
import { usePwa } from "./use-pwa";
import { useToast } from "./use-toast";
import { getChatSettings, type ChatSetting } from "@/services/chat-api";

// ── Types ──────────────────────────────────────────
type EventHandler = (event: any) => void;
type Unsubscribe = () => void;

interface EventBusContextValue {
  /** Subscribe to a specific WS event type. Returns an unsubscribe function. */
  subscribe: (eventType: string, handler: EventHandler) => Unsubscribe;
  /** The raw last event from the global /ws/user socket (for legacy compat). */
  lastEvent: any;
}

const EventBusContext = createContext<EventBusContextValue | null>(null);

// ── Provider ───────────────────────────────────────
export function EventBusProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const { notifPermission } = usePwa();
  const { toast } = useToast();

  // Single global /ws/user connection
  const pathFactory = useCallback((token: string) => wsPaths.user(token), []);
  const { lastEvent } = useSocket(pathFactory);

  // Subscriber registry: eventType → Set<handler>
  const subscribersRef = useRef(new Map<string, Set<EventHandler>>());

  const subscribe = useCallback((eventType: string, handler: EventHandler): Unsubscribe => {
    const map = subscribersRef.current;
    if (!map.has(eventType)) {
      map.set(eventType, new Set());
    }
    map.get(eventType)!.add(handler);
    return () => {
      map.get(eventType)?.delete(handler);
      if (map.get(eventType)?.size === 0) map.delete(eventType);
    };
  }, []);

  // Load chat settings for mute checks
  const { data: chatSettingsList = [] } = useQuery({
    queryKey: ["chat-settings"],
    queryFn: getChatSettings,
    enabled: Boolean(user),
  });

  const isChatMuted = useMemo(() => {
    const now = Date.now();
    return (key: { roomId?: string; friendId?: number }) => {
      const setting = chatSettingsList.find((s: ChatSetting) =>
        key.roomId ? s.roomId === key.roomId : key.friendId ? s.friendId === key.friendId : false,
      );
      if (!setting || !setting.muted) return false;
      if (setting.muteUntil && new Date(setting.muteUntil).getTime() < now) return false;
      return true;
    };
  }, [chatSettingsList]);

  // ── Central event dispatcher ─────────────────────
  useEffect(() => {
    if (!user || !lastEvent) return;

    // Notify subscribers first
    const handlers = subscribersRef.current.get(lastEvent.type);
    if (handlers) {
      handlers.forEach((fn) => {
        try { fn(lastEvent); } catch { /* subscriber error shouldn't break bus */ }
      });
    }

    // ─── friend_request_received ───
    if (lastEvent.type === "friend_request_received") {
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests-count"] });
      queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
      if (notifPermission === "granted") {
        new Notification("Friend Request \u2022 Vibely", {
          body: `${lastEvent.senderNickname} sent you a friend request`,
          icon: "/vibely-icon.svg",
          tag: "friend-request",
        });
      }
      try { new Audio("/notification.wav").play(); } catch {}
    }

    // ─── friend_request_accepted ───
    if (lastEvent.type === "friend_request_accepted") {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["outgoing-friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests-count"] });
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
    }

    // ─── direct_message ───
    if (lastEvent.type === "direct_message" && lastEvent.senderId !== user.id) {
      const isInChat = location.startsWith(`/dm/${lastEvent.senderId}`);
      const isHidden = document.hidden;
      const muted = isChatMuted({ friendId: lastEvent.senderId });
      queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
      if (!muted && (!isInChat || isHidden)) {
        if (notifPermission === "granted") {
          const preview =
            lastEvent.messageType === "gif"
              ? "Sent a GIF"
              : lastEvent.messageType === "image"
                ? "Sent an image"
                : String(lastEvent.content || "").slice(0, 80);
          new Notification("New Message \u2022 Vibely", {
            body: `${lastEvent.senderNickname}: ${preview}`,
            icon: "/vibely-icon.svg",
            tag: `dm-${lastEvent.senderId}`,
          });
        }
        try { new Audio("/notification.wav").play(); } catch {}
      }
    }

    // ─── room_message ───
    if (lastEvent.type === "room_message" && lastEvent.senderId !== user.id) {
      queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
      const isInRoom = location.startsWith(`/rooms/${lastEvent.roomId}`);
      const muted = isChatMuted({ roomId: lastEvent.roomId });
      if (!muted && !isInRoom) {
        try { new Audio("/notification.wav").play(); } catch {}
      }
    }

    // ─── presence_update ───
    if (lastEvent.type === "presence_update") {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    }

    // ─── profile_updated ───
    if (lastEvent.type === "profile_updated") {
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }

    // ─── user_joined / user_left ───
    if (lastEvent.type === "user_joined" || lastEvent.type === "user_left") {
      if (lastEvent.roomId) {
        queryClient.invalidateQueries({ queryKey: ["room-members", lastEvent.roomId] });
        queryClient.invalidateQueries({ queryKey: ["room-stats", lastEvent.roomId] });
      }
      queryClient.invalidateQueries({ queryKey: ["joinedRooms"] });
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
    }

    // ─── room_invite ───
    if (lastEvent.type === "room_invite") {
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      queryClient.invalidateQueries({ queryKey: ["joinedRooms"] });
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      if (notifPermission === "granted") {
        new Notification("Room Invite \u2022 Vibely", {
          body: `You were added to ${lastEvent.roomName || "a room"}`,
          icon: "/vibely-icon.svg",
          tag: `room-invite-${lastEvent.roomId}`,
        });
      }
      try { new Audio("/notification.wav").play(); } catch {}
    }

    // ─── chat mute/unmute ───
    if (lastEvent.type === "chat_muted" || lastEvent.type === "chat_unmuted") {
      queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
    }
  }, [lastEvent, user, queryClient, location, notifPermission, isChatMuted]);

  const value = useMemo(() => ({ subscribe, lastEvent }), [subscribe, lastEvent]);

  return (
    <EventBusContext.Provider value={value}>
      {children}
    </EventBusContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────

/** Access the raw event bus context */
export function useEventBus() {
  const ctx = useContext(EventBusContext);
  if (!ctx) throw new Error("useEventBus must be used within EventBusProvider");
  return ctx;
}

/** Subscribe to a specific WS event type. Handler is called with the event payload. */
export function useGlobalEvent(eventType: string, handler: EventHandler) {
  const { subscribe } = useEventBus();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe(eventType, (event) => handlerRef.current(event));
  }, [subscribe, eventType]);
}
