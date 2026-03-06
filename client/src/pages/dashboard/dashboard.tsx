import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, Hash, MessageSquare, Plus, ArrowRight } from "lucide-react";
import { createRoom, getFriends, getJoinedRooms } from "@/services/chat-api";
import { getMyProfile } from "@/services/profile-api";
import { Button } from "@/components/ui/button";

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-black leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const { data: joinedRooms = [] } = useQuery({ queryKey: ["joinedRooms"], queryFn: getJoinedRooms });

  const onlineFriends = friends.filter((f) => f.isOnline);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Welcome back!</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Hash} label="Rooms Joined" value={joinedRooms.length} color="bg-violet-500" />
        <StatCard icon={Users} label="Friends" value={profile?.friendCount ?? friends.length} color="bg-blue-500" />
        <StatCard icon={MessageSquare} label="Messages Sent" value={profile?.messageCount ?? 0} color="bg-emerald-500" />
      </div>

      {/* Quick actions */}
      <section className="rounded-2xl border bg-card p-4">
        <h3 className="font-semibold mb-3">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            onClick={async () => {
              const room = await createRoom();
              window.location.href = `/rooms/${room.id}`;
            }}
          >
            <Plus className="h-4 w-4" />
            Create Room
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setLocation("/rooms")}>
            <Hash className="h-4 w-4" />
            Browse Rooms
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setLocation("/search")}>
            <Users className="h-4 w-4" />
            Find Friends
          </Button>
        </div>
      </section>

      {/* Online friends */}
      {onlineFriends.length > 0 && (
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Online now</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => setLocation("/friends")}
            >
              See all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {onlineFriends.slice(0, 8).map((friend) => (
              <button
                key={friend.id}
                type="button"
                className="flex flex-col items-center gap-1.5 group"
                onClick={() => setLocation(`/dm/${friend.id}`)}
              >
                <div className="relative">
                  {friend.avatarUrl ? (
                    <img
                      src={friend.avatarUrl}
                      alt={friend.nickname || friend.username}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-background"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold select-none">
                      {(friend.nickname || friend.username)[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-card" />
                </div>
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors max-w-[56px] truncate">
                  {friend.nickname || friend.username}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent rooms */}
      {joinedRooms.length > 0 && (
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent rooms</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => setLocation("/rooms")}
            >
              See all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {joinedRooms.slice(0, 4).map((room) => (
              <button
                key={room.roomId}
                type="button"
                className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 hover:bg-muted transition-colors text-left"
                onClick={() => setLocation(`/rooms/${room.roomId}`)}
              >
                <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                  <Hash className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{room.roomName || `Room ${room.roomId}`}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(room.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
