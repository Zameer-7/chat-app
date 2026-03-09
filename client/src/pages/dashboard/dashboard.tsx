import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Users, Hash, Plus, ArrowRight, Search, Inbox, MessageCircle, UserPlus } from "lucide-react";
import { createRoom, getFriends, getJoinedRooms, getFriendRequests } from "@/services/chat-api";
import { getMyProfile } from "@/services/profile-api";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02] text-left w-full"
    >
      <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-black leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: profile } = useQuery({ queryKey: ["profile-me"], queryFn: getMyProfile });
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const { data: joinedRooms = [] } = useQuery({ queryKey: ["joinedRooms"], queryFn: getJoinedRooms });
  const { data: pendingRequests = [] } = useQuery({ queryKey: ["friend-requests"], queryFn: getFriendRequests });

  const onlineFriends = friends.filter((f) => f.isOnline);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Welcome back, {user?.nickname || user?.username} 👋
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Hash}
          label="Rooms Joined"
          value={profile?.roomCount ?? joinedRooms.length}
          color="text-violet-600 dark:text-violet-400"
          bgColor="bg-violet-100 dark:bg-violet-900/40"
          onClick={() => setLocation("/rooms")}
        />
        <StatCard
          icon={Users}
          label="Friends"
          value={profile?.friendCount ?? friends.length}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-100 dark:bg-blue-900/40"
          onClick={() => setLocation("/friends")}
        />
        <StatCard
          icon={Inbox}
          label="Pending Requests"
          value={pendingRequests.length}
          color="text-amber-600 dark:text-amber-400"
          bgColor="bg-amber-100 dark:bg-amber-900/40"
          onClick={() => setLocation("/friend-requests")}
        />
      </div>

      {/* Quick Actions */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h3 className="font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 px-4 py-3.5 hover:shadow-md transition-all duration-200 hover:scale-[1.02]"
            onClick={async () => {
              const room = await createRoom();
              setLocation(`/rooms/${room.id}`);
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Create Room</p>
              <p className="text-xs text-muted-foreground">Start a new chat room</p>
            </div>
          </button>

          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 px-4 py-3.5 hover:shadow-md transition-all duration-200 hover:scale-[1.02]"
            onClick={() => setLocation("/rooms")}
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Browse Rooms</p>
              <p className="text-xs text-muted-foreground">Explore active rooms</p>
            </div>
          </button>

          <button
            type="button"
            className="flex items-center gap-3 rounded-xl border bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 px-4 py-3.5 hover:shadow-md transition-all duration-200 hover:scale-[1.02]"
            onClick={() => setLocation("/search")}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
              <Search className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Find Friends</p>
              <p className="text-xs text-muted-foreground">Search for people</p>
            </div>
          </button>
        </div>
      </section>

      {/* Two-column layout for Online Friends + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Online friends */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Online Now</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => setLocation("/friends")}
            >
              See all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {onlineFriends.length > 0 ? (
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
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-sm font-bold text-white select-none">
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
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No friends online right now</p>
          )}
        </section>

        {/* Recent Activity */}
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {/* Pending friend requests */}
            {pendingRequests.slice(0, 3).map((req) => (
              <div key={`fr-${req.id}`} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    <span className="font-medium">{req.senderNickname || req.senderUsername}</span>{" "}
                    sent you a friend request
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(req.createdAt), "MMM d")}
                  </p>
                </div>
              </div>
            ))}

            {/* Recent rooms joined */}
            {joinedRooms.slice(0, 3).map((room) => (
              <button
                key={`room-${room.roomId}`}
                type="button"
                className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 w-full text-left hover:bg-muted transition-colors"
                onClick={() => setLocation(`/rooms/${room.roomId}`)}
              >
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                  <Hash className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    Joined <span className="font-medium">{room.roomName || `Room ${room.roomId}`}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(room.joinedAt), "MMM d")}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}

            {pendingRequests.length === 0 && joinedRooms.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
