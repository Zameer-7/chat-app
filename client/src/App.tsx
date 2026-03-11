import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { EventBusProvider } from "@/hooks/use-event-bus";
import { usePwa } from "@/hooks/use-pwa";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/config/api";

import LoginPage from "@/pages/auth/login";
import SignupPage from "@/pages/auth/signup";
import VerifyEmailPage from "@/pages/auth/verify-email";
import ForgotPasswordPage from "@/pages/auth/forgot-password";
import ResetPasswordPage from "@/pages/auth/reset-password";
import DashboardPage from "@/pages/dashboard/dashboard";
import RoomsPage from "@/pages/dashboard/rooms";
import FriendsPage from "@/pages/dashboard/friends";
import FriendRequestsPage from "@/pages/dashboard/friend-requests";
import NotificationsPage from "@/pages/dashboard/notifications";
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
  "/forgot-password": "Forgot Password \u2022 Vibely",
  "/reset-password": "Reset Password \u2022 Vibely",
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

function ServerHealthMonitor() {
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      try {
        const res = await fetch(buildApiUrl("/api/auth/captcha"), {
          method: "HEAD",
          cache: "no-store",
        });
        if (mounted) setServerDown(!res.ok && res.status >= 500);
      } catch {
        if (mounted) setServerDown(true);
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!serverDown) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-white/70 bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Server Temporarily Unavailable</h2>
        <p className="mt-2 text-sm text-gray-600">
          We’re sorry for the inconvenience. Our server is currently down and will be back up shortly. Please hang tight!
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
          Checking connection every 30s…
        </div>
      </div>
    </div>
  );
}

function PwaPrompts() {
  const { user } = useAuth();
  const { canInstall, installApp, requestNotifications } = usePwa();
  const { toast } = useToast();

  // Ask for notification permission once user is logged in
  useEffect(() => {
    if (!user) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
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
      <Route path="/forgot-password">
        <PublicOnly>
          <ForgotPasswordPage />
        </PublicOnly>
      </Route>
      <Route path="/reset-password">
        <PublicOnly>
          <ResetPasswordPage />
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
      <Route path="/notifications">
        <AuthGate>
          <NotificationsPage />
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
          <EventBusProvider>
            <ServerHealthMonitor />
            <PwaPrompts />
            <PageTitle />
            <Toaster />
            <Router />
          </EventBusProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
