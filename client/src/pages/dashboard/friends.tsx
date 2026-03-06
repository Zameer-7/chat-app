import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, UserPlus } from "lucide-react";
import { wsPaths } from "@shared/routes";
import { useSocket } from "@/hooks/use-socket";
import { getFriends, type Friend } from "@/services/chat-api";
import { Button } from "@/components/ui/button";

function getInitials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatLastSeen(lastSeen: string) {
  if (!lastSeen) return "";
  const date = new Date(lastSeen);
  if (isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FriendAvatar({ friend }: { friend: Friend }) {
  const [imgError, setImgError] = useState(false);

  if (friend.avatarUrl && !imgError) {
    return (
      <img
        src={friend.avatarUrl}
        alt={friend.nickname || friend.username}
        className="h-[52px] w-[52px] shrink-0 rounded-full object-cover ring-2 ring-background"
        onError={() => setImgError(true)}
      />
    );
  }

  const colors = [
    "bg-violet-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-cyan-500",
    "bg-pink-500",
  ];
  const color = colors[friend.id % colors.length];

  return (
    <div
      className={`h-[52px] w-[52px] shrink-0 select-none rounded-full ${color} flex items-center justify-center text-base font-bold text-white ring-2 ring-background`}
    >
      {getInitials(friend.nickname || friend.username)}
    </div>
  );
}

export default function FriendsPage() {
  const [, setLocation] = useLocation();
  const { data: friends = [], isLoading } = useQuery({ queryKey: ["friends"], queryFn: getFriends });

  const [onlineOverrides, setOnlineOverrides] = useState<Map<number, boolean>>(new Map());
  const wsPath = useCallback((token: string) => wsPaths.user(token), []);
  const { lastEvent } = useSocket(wsPath);

  useEffect(() => {
    if (lastEvent?.type === "presence_update") {
      const uid = Number(lastEvent.userId);
      const isOnline = Boolean(lastEvent.isOnline);
      setOnlineOverrides((prev) => {
        const next = new Map(prev);
        next.set(uid, isOnline);
        return next;
      });
    }
  }, [lastEvent]);

  const isOnline = (friend: Friend) =>
    onlineOverrides.has(friend.id) ? onlineOverrides.get(friend.id)! : friend.isOnline;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">Friends</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {friends.length} friend{friends.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/search")}>
          <UserPlus className="h-4 w-4" />
          Add Friend
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-[140px] animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && friends.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <UserPlus className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">No friends yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Search for users and start chatting.</p>
          </div>
          <Button size="sm" className="mt-1" onClick={() => setLocation("/search")}>
            Find Friends
          </Button>
        </div>
      )}

      {!isLoading && friends.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {friends.map((friend) => {
            const online = isOnline(friend);
            const lastSeen = !online && friend.lastSeen ? formatLastSeen(friend.lastSeen) : null;

            return (
              <div
                key={friend.id}
                className="group relative flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <FriendAvatar friend={friend} />
                    <span
                      className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full ring-2 ring-card ${
                        online ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{friend.nickname || friend.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{friend.username}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          online ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                      <span
                        className={`text-[11px] font-medium ${
                          online ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                        }`}
                      >
                        {online ? "Online" : lastSeen ? `Last seen ${lastSeen}` : "Offline"}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full gap-2 transition-opacity"
                  onClick={() => setLocation(`/dm/${friend.id}`)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Message
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
