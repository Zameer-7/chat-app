import { Link, useLocation } from "wouter";
import { Home, Users, Search, Inbox, MessageCircle, LogOut, Settings, CircleUserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { authFetch } from "@/services/api";
import { NovaLogo } from "./nova-logo";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/rooms", label: "Rooms", icon: MessageCircle },
  { href: "/friends", label: "Friends", icon: Users },
];

const socialNav = [
  { href: "/friend-requests", label: "Friend Requests", icon: Inbox, badge: "friendRequests" as const },
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

  const { data: frCount } = useQuery<{ count: number }>({
    queryKey: ["friend-requests-count"],
    queryFn: () => authFetch<{ count: number }>(api.friendRequests.count),
    refetchInterval: 30_000,
  });

  const friendRequestCount = frCount?.count ?? 0;

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
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 flex flex-col sidebar-themed shadow-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <NovaLogo compact />
          <span className="text-lg font-bold text-white tracking-tight">Vibely</span>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0 select-none">
              {getInitials(user?.nickname ?? user?.username)}
            </div>
            {/* Online dot */}
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-gray-900" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user?.nickname || user?.username}</p>
            <p className="truncate text-xs text-white/50">Online</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {mainNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}

          <div className="my-3 border-t border-white/10" />

          {socialNav.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              badge={item.badge === "friendRequests" ? friendRequestCount : undefined}
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
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors duration-150"
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

      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
