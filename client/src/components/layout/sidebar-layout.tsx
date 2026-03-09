import { Link, useLocation } from "wouter";
import { Home, Users, Search, Inbox, MessageCircle, LogOut, Settings, CircleUserRound, Menu, X, Download, Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getUnreadCounts, getChatSettings, type ChatSetting } from "@/services/chat-api";
import { getUnreadNotificationCount } from "@/services/notification-api";
import { NovaLogo } from "./nova-logo";
import { usePwa } from "@/hooks/use-pwa";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/rooms", label: "Rooms", icon: MessageCircle },
  { href: "/friends", label: "Friends", icon: Users },
];

const socialNav = [
  { href: "/friend-requests", label: "Friend Requests", icon: Inbox, badge: "friendRequests" as const },
  { href: "/notifications", label: "Notifications", icon: Bell, badge: "notifications" as const },
  { href: "/search", label: "Search Users", icon: Search },
];

const accountNav = [
  { href: "/profile", label: "Profile", icon: CircleUserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function getInitials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canInstall, installApp } = usePwa();

  const { data: unread } = useQuery({
    queryKey: ["unread-counts"],
    queryFn: getUnreadCounts,
    refetchInterval: 15_000,
  });

  const { data: notifCount = 0 } = useQuery({
    queryKey: ["notification-count"],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30_000,
  });

  const { data: chatSettingsList = [] } = useQuery({
    queryKey: ["chat-settings"],
    queryFn: getChatSettings,
  });

  const now = Date.now();
  const mutedFriendIds = new Set(
    chatSettingsList
      .filter((s: ChatSetting) => s.friendId && s.muted && (!s.muteUntil || new Date(s.muteUntil).getTime() > now))
      .map((s: ChatSetting) => s.friendId),
  );
  const mutedRoomIds = new Set(
    chatSettingsList
      .filter((s: ChatSetting) => s.roomId && s.muted && (!s.muteUntil || new Date(s.muteUntil).getTime() > now))
      .map((s: ChatSetting) => s.roomId),
  );

  const friendRequestCount = unread?.friendRequests ?? 0;
  const totalDmUnread = unread?.dm?.filter((d) => !mutedFriendIds.has(d.friendId)).reduce((sum, d) => sum + d.count, 0) ?? 0;
  const totalRoomUnread = unread?.rooms?.filter((r) => !mutedRoomIds.has(r.roomId)).reduce((sum, r) => sum + r.count, 0) ?? 0;

  function NavLink({
    href,
    label,
    icon: Icon,
    badge,
  }: {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }) {
    const active = location === href || location.startsWith(`${href}/`);
    return (
      <Link href={href}>
        <a
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 ${
            active
              ? "bg-white/20 text-white border-l-4 border-white/70"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
          onClick={() => setMobileOpen(false)}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {badge != null && badge > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </a>
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Mobile header — only visible below lg breakpoint */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 sidebar-themed border-b border-white/10">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/80 hover:text-white rounded-lg hover:bg-white/10 touch-manipulation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <NovaLogo compact />
        <span className="text-base font-bold text-white tracking-tight">Vibely</span>
      </div>

      {/* Overlay backdrop when mobile sidebar is open */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col sidebar-themed shadow-xl
          transform transition-transform duration-300 ease-in-out
          lg:static lg:translate-x-0 lg:shrink-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo — includes close button on mobile */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <NovaLogo compact />
          <span className="text-lg font-bold text-white tracking-tight flex-1">Vibely</span>
          <button
            type="button"
            aria-label="Close navigation"
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-white/60 hover:text-white rounded-lg hover:bg-white/10 touch-manipulation"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.nickname || user.username}
              className="w-10 h-10 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-sm font-bold text-white shrink-0 select-none">
              {getInitials(user?.nickname ?? user?.username)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user?.nickname || user?.username}</p>
            <p className="truncate text-xs text-white/50">@{user?.username}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {mainNav.map((item) => {
            let badge: number | undefined;
            if (item.href === "/rooms") badge = totalRoomUnread || undefined;
            if (item.href === "/friends") badge = totalDmUnread || undefined;
            return <NavLink key={item.href} {...item} badge={badge} />;
          })}

          <div className="my-3 border-t border-white/10" />

          {socialNav.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              badge={
                item.badge === "friendRequests"
                  ? friendRequestCount
                  : item.badge === "notifications"
                    ? notifCount
                    : undefined
              }
            />
          ))}

          <div className="my-3 border-t border-white/10" />

          {accountNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 border-t border-white/10 pt-3">
          <button
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors duration-150 min-h-[44px] touch-manipulation"
            onClick={() => {
              logout();
              setLocation("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-3 pb-20 lg:p-6 lg:pb-6">{children}</main>

      {/* Bottom navigation bar — mobile only */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden flex items-stretch bg-background border-t border-border shadow-lg safe-area-bottom">
        {[
          { href: "/dashboard", icon: Home, label: "Home", badge: 0 },
          { href: "/rooms", icon: MessageCircle, label: "Rooms", badge: totalRoomUnread },
          { href: "/friends", icon: Users, label: "Friends", badge: totalDmUnread },
          { href: "/profile", icon: CircleUserRound, label: "Profile", badge: 0 },
        ].map(({ href, icon: Icon, label, badge }) => {
          const active = location === href || location.startsWith(`${href}/`);
          return (
            <Link key={href} href={href}>
              <a
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors touch-manipulation relative ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative">
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                {label}
              </a>
            </Link>
          );
        })}
        {canInstall && (
          <button
            type="button"
            onClick={installApp}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors touch-manipulation"
          >
            <Download className="h-5 w-5" />
            Install
          </button>
        )}
      </nav>
    </div>
  );
}
