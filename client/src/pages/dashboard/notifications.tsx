import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNotifications, markNotificationRead, markAllNotificationsRead, type AppNotification } from "@/services/notification-api";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck, MessageCircle, UserPlus, Users } from "lucide-react";
import { useLocation } from "wouter";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function notifIcon(type: string) {
  switch (type) {
    case "new_message": return <MessageCircle className="h-4 w-4" />;
    case "friend_request": return <UserPlus className="h-4 w-4" />;
    case "room_invite": return <Users className="h-4 w-4" />;
    default: return <Bell className="h-4 w-4" />;
  }
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: notifications = [], isLoading } = useQuery({ queryKey: ["notifications"], queryFn: getNotifications });

  const markReadMut = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  function handleClick(notif: AppNotification) {
    if (!notif.isRead) markReadMut.mutate(notif.id);
    if (notif.type === "new_message" && notif.referenceId) {
      setLocation(`/dm/${notif.referenceId}`);
    } else if (notif.type === "friend_request") {
      setLocation("/friend-requests");
    } else if (notif.type === "room_invite" && notif.referenceId) {
      setLocation(`/rooms/${notif.referenceId}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Notifications</h2>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => markAllMut.mutate()}
            disabled={markAllMut.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-1">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}
        {!isLoading && notifications.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No notifications yet.</p>
        )}
        {notifications.map((notif) => (
          <button
            key={notif.id}
            type="button"
            onClick={() => handleClick(notif)}
            className={`w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent ${
              !notif.isRead ? "bg-primary/5" : ""
            }`}
          >
            <div className={`mt-0.5 shrink-0 rounded-full p-2 ${
              !notif.isRead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {notifIcon(notif.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${!notif.isRead ? "font-semibold" : ""}`}>{notif.message}</p>
              <p className="text-xs text-muted-foreground">{timeAgo(notif.createdAt)}</p>
            </div>
            {!notif.isRead && (
              <div className="shrink-0 mt-1">
                <span className="h-2 w-2 rounded-full bg-primary block" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
