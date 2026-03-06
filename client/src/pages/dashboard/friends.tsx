import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle } from "lucide-react";
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

export default function FriendsPage() {
  const [, setLocation] = useLocation();
  const { data: friends = [], isLoading } = useQuery({ queryKey: ["friends"], queryFn: getFriends });

  // Track realtime online overrides: userId → isOnline
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
      <div>
        <h2 className="text-2xl font-black">Friends</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {friends.length} friend{friends.length !== 1 ? "s" : ""}
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 rounded-2xl border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && friends.length === 0 && (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="text-muted-foreground text-sm">No accepted friends yet.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/search")}>
            Find friends
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {friends.map((friend) => {
          const online = isOnline(friend);
          return (
            <div
              key={friend.id}
              className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Avatar + name row */}
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-base font-bold select-none">
                    {getInitials(friend.nickname || friend.username)}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-card ${
                      online ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{friend.nickname || friend.username}</p>
                  <p className="text-xs text-muted-foreground truncate">@{friend.username}</p>
                </div>
              </div>

              {/* Online status */}
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-gray-400"}`} />
                <span className={`text-xs font-medium ${online ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {online ? "Online" : "Offline"}
                </span>
              </div>

              {/* Message button */}
              <Button
                size="sm"
                className="w-full gap-2"
                onClick={() => setLocation(`/dm/${friend.id}`)}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Message
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
