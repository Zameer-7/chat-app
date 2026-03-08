import { useCallback, useEffect, useMemo } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSocket } from "@/hooks/use-socket";
import { wsPaths } from "@shared/routes";
import { usePwa } from "@/hooks/use-pwa";
import { useToast } from "@/hooks/use-toast";
import { getChatSettings, type ChatSetting } from "@/services/chat-api";

import LoginPage from "@/pages/auth/login";
import SignupPage from "@/pages/auth/signup";
import VerifyEmailPage from "@/pages/auth/verify-email";
import DashboardPage from "@/pages/dashboard/dashboard";
import RoomsPage from "@/pages/dashboard/rooms";
import FriendsPage from "@/pages/dashboard/friends";
import FriendRequestsPage from "@/pages/dashboard/friend-requests";
import SearchUsersPage from "@/pages/dashboard/search-users";
import SettingsPage from "@/pages/dashboard/settings";
import ProfilePage from "@/pages/dashboard/profile";
import RoomChatPage from "@/pages/dashboard/room-chat";
import DirectChatPage from "@/pages/dashboard/direct-chat";
import NotFound from "@/pages/not-found";

const PAGE_TITLES: Record<string, string> = {
  "/": "Vibely",
  "/login": "Login \u2022 Vibely",
  "/signup": "Sign Up \u2022 Vibely",
  "/dashboard": "Dashboard \u2022 Vibely",
  "/rooms": "Rooms \u2022 Vibely",
  "/friends": "Friends \u2022 Vibely",
  "/friend-requests": "Friend Requests \u2022 Vibely",
  "/search": "Search \u2022 Vibely",
  "/profile": "Profile \u2022 Vibely",
  "/settings": "Settings \u2022 Vibely",
};

function PageTitle() {
  const [location] = useLocation();

  useEffect(() => {
    // Dynamic segments like /rooms/:id and /dm/:friendId
    if (location.startsWith("/rooms/")) {
      document.title = "Room Chat \u2022 Vibely";
    } else if (location.startsWith("/dm/")) {
      document.title = "Direct Message \u2022 Vibely";
    } else {
      document.title = PAGE_TITLES[location] ?? "Vibely";
    }
  }, [location]);

  return null;
}

function GlobalEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const pathFactory = useCallback((token: string) => wsPaths.user(token), []);
  const { lastEvent } = useSocket(pathFactory);
  const { canInstall, installApp, notifPermission, requestNotifications } = usePwa();
  const { toast } = useToast();

  // Load chat settings so we can check mute status
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

  // Ask for notification permission once user is logged in
  useEffect(() => {
    if (!user) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      // Slight delay so it doesn't interrupt first load
      const t = setTimeout(() => requestNotifications(), 3000);
      return () => clearTimeout(t);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show install prompt as a toast
  useEffect(() => {
    if (!canInstall) return;
    toast({
      title: "Install Vibely",
      description: "Add Vibely to your home screen for the best experience.",
      action: (
        <button
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
          onClick={installApp}
        >
          Install
        </button>
      ) as unknown as React.ReactElement,
      duration: 12000,
    });
  }, [canInstall]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !lastEvent) return;

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
      // Play notification sound
      try { new Audio("/notification.wav").play(); } catch {}
    }

    if (lastEvent.type === "friend_request_accepted") {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["outgoing-friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests-count"] });
    }

    // Show foreground notification for incoming DMs when not in that chat
    if (
      lastEvent.type === "direct_message" &&
      lastEvent.senderId !== user.id
    ) {
      const isInChat = location.startsWith(`/dm/${lastEvent.senderId}`);
      const isHidden = document.hidden;
      const muted = isChatMuted({ friendId: lastEvent.senderId });
      // Update unread counts for sidebar badges
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
        // Play notification sound
        try { new Audio("/notification.wav").play(); } catch {}
      }
    }

    // Room message notification when not viewing that room
    if (
      lastEvent.type === "room_message" &&
      lastEvent.senderId !== user.id
    ) {
      queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
      const isInRoom = location.startsWith(`/rooms/${lastEvent.roomId}`);
      const muted = isChatMuted({ roomId: lastEvent.roomId });
      if (!muted && !isInRoom) {
        try { new Audio("/notification.wav").play(); } catch {}
      }
    }

    // Presence updates — refresh friends list for online/offline display
    if (lastEvent.type === "presence_update") {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    }

    // User joined/left room — refresh member lists
    if (lastEvent.type === "user_joined" || lastEvent.type === "user_left") {
      if (lastEvent.roomId) {
        queryClient.invalidateQueries({ queryKey: ["room-members", lastEvent.roomId] });
        queryClient.invalidateQueries({ queryKey: ["room-stats", lastEvent.roomId] });
      }
    }

    // Room invite — refresh joined rooms
    if (lastEvent.type === "room_invite") {
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      queryClient.invalidateQueries({ queryKey: ["joinedRooms"] });
      if (notifPermission === "granted") {
        new Notification("Room Invite \u2022 Vibely", {
          body: `You were added to ${lastEvent.roomName || "a room"}`,
          icon: "/vibely-icon.svg",
          tag: `room-invite-${lastEvent.roomId}`,
        });
      }
      try { new Audio("/notification.wav").play(); } catch {}
    }

    // Chat muted/unmuted events — refresh settings
    if (lastEvent.type === "chat_muted" || lastEvent.type === "chat_unmuted") {
      queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
    }
  }, [lastEvent, user, queryClient, location, notifPermission, isChatMuted]);

  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [loading, user, setLocation]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return <SidebarLayout>{children}</SidebarLayout>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (user) return null;

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicOnly>
          <LoginPage />
        </PublicOnly>
      </Route>
      <Route path="/signup">
        <PublicOnly>
          <SignupPage />
        </PublicOnly>
      </Route>
      <Route path="/verify-email">
        <PublicOnly>
          <VerifyEmailPage />
        </PublicOnly>
      </Route>

      <Route path="/dashboard">
        <AuthGate>
          <DashboardPage />
        </AuthGate>
      </Route>
      <Route path="/rooms">
        <AuthGate>
          <RoomsPage />
        </AuthGate>
      </Route>
      <Route path="/rooms/:id">
        <AuthGate>
          <RoomChatPage />
        </AuthGate>
      </Route>
      <Route path="/friends">
        <AuthGate>
          <FriendsPage />
        </AuthGate>
      </Route>
      <Route path="/friend-requests">
        <AuthGate>
          <FriendRequestsPage />
        </AuthGate>
      </Route>
      <Route path="/search">
        <AuthGate>
          <SearchUsersPage />
        </AuthGate>
      </Route>
      <Route path="/profile">
        <AuthGate>
          <ProfilePage />
        </AuthGate>
      </Route>
      <Route path="/settings">
        <AuthGate>
          <SettingsPage />
        </AuthGate>
      </Route>
      <Route path="/dm/:friendId">
        <AuthGate>
          <DirectChatPage />
        </AuthGate>
      </Route>

      <Route path="/">
        <PublicOnly>
          <LoginPage />
        </PublicOnly>
      </Route>

      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <GlobalEvents />
          <PageTitle />
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
