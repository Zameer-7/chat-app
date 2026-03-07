import { useCallback, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSocket } from "@/hooks/use-socket";
import { wsPaths } from "@shared/routes";
import { usePwa } from "@/hooks/use-pwa";
import { useToast } from "@/hooks/use-toast";

import LoginPage from "@/pages/auth/login";
import SignupPage from "@/pages/auth/signup";
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
      if (notifPermission === "granted") {
        new Notification("Friend Request \u2022 Vibely", {
          body: `${lastEvent.senderNickname} sent you a friend request`,
          icon: "/vibely-icon.svg",
          tag: "friend-request",
        });
      }
    }

    // Show foreground notification for incoming DMs when not in that chat
    if (
      lastEvent.type === "direct_message" &&
      lastEvent.senderId !== user.id
    ) {
      const isInChat = location.startsWith(`/dm/${lastEvent.senderId}`);
      const isHidden = document.hidden;
      if (!isInChat || isHidden) {
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
      }
    }
  }, [lastEvent, user, queryClient, location, notifPermission]);

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
