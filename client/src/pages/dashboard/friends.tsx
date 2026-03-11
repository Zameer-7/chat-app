import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  MessageCircle,
  MoreVertical,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import { useGlobalEvent } from "@/hooks/use-event-bus";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  getFriends,
  getFriendsStatus,
  getChatSettings,
  getUnreadCounts,
  getLastMessagePreviews,
  archiveChat,
  unarchiveChat,
  muteChat,
  unmuteChat,
  deleteDirectChat,
  type Friend,
  type ChatSetting,
} from "@/services/chat-api";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

function formatPreviewTime(dateStr: string) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FriendAvatar({ friend, size = 52 }: { friend: Friend; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = size === 52 ? "h-[52px] w-[52px]" : "h-12 w-12";

  if (friend.avatarUrl && !imgError) {
    return (
      <img
        src={friend.avatarUrl}
        alt={friend.nickname || friend.username}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-background`}
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
      className={`${sizeClass} shrink-0 select-none rounded-full ${color} flex items-center justify-center text-base font-bold text-white ring-2 ring-background`}
    >
      {getInitials(friend.nickname || friend.username)}
    </div>
  );
}

type MenuAction = {
  friend: Friend;
  isMuted: boolean;
  isArchived: boolean;
  onOpenChat: () => void;
  onViewProfile: () => void;
  onMute: (duration: "1h" | "8h" | "1w" | "forever") => void;
  onUnmute: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDeleteChat: () => void;
};

function MenuItems({
  isMuted,
  isArchived,
  onOpenChat,
  onViewProfile,
  onMute,
  onUnmute,
  onArchive,
  onUnarchive,
  onDeleteChat,
  MenuItemComponent,
  SeparatorComponent,
  SubComponent,
  SubTriggerComponent,
  SubContentComponent,
}: MenuAction & {
  MenuItemComponent: React.ElementType;
  SeparatorComponent: React.ElementType;
  SubComponent: React.ElementType;
  SubTriggerComponent: React.ElementType;
  SubContentComponent: React.ElementType;
}) {
  return (
    <>
      <MenuItemComponent onClick={onOpenChat}>
        <MessageCircle className="mr-2 h-4 w-4" /> Open Chat
      </MenuItemComponent>
      <MenuItemComponent onClick={onViewProfile}>
        <User className="mr-2 h-4 w-4" /> View Profile
      </MenuItemComponent>
      <SeparatorComponent />
      {isMuted ? (
        <MenuItemComponent onClick={onUnmute}>
          <Bell className="mr-2 h-4 w-4" /> Unmute
        </MenuItemComponent>
      ) : (
        <SubComponent>
          <SubTriggerComponent>
            <BellOff className="mr-2 h-4 w-4" /> Mute
          </SubTriggerComponent>
          <SubContentComponent>
            <MenuItemComponent onClick={() => onMute("1h")}>1 hour</MenuItemComponent>
            <MenuItemComponent onClick={() => onMute("8h")}>8 hours</MenuItemComponent>
            <MenuItemComponent onClick={() => onMute("1w")}>1 week</MenuItemComponent>
            <MenuItemComponent onClick={() => onMute("forever")}>Forever</MenuItemComponent>
          </SubContentComponent>
        </SubComponent>
      )}
      {isArchived ? (
        <MenuItemComponent onClick={onUnarchive}>
          <ArchiveRestore className="mr-2 h-4 w-4" /> Unarchive
        </MenuItemComponent>
      ) : (
        <MenuItemComponent onClick={onArchive}>
          <Archive className="mr-2 h-4 w-4" /> Archive
        </MenuItemComponent>
      )}
      <SeparatorComponent />
      <MenuItemComponent className="text-destructive focus:text-destructive" onClick={onDeleteChat}>
        <Trash2 className="mr-2 h-4 w-4" /> Delete Chat
      </MenuItemComponent>
    </>
  );
}

export default function FriendsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: friends = [], isLoading } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const { data: chatSettingsList = [] } = useQuery({ queryKey: ["chat-settings"], queryFn: getChatSettings });
  const { data: unread } = useQuery({ queryKey: ["unread-counts"], queryFn: getUnreadCounts, refetchInterval: 15_000 });
  const { data: lastMessages = [] } = useQuery({ queryKey: ["last-messages"], queryFn: getLastMessagePreviews, refetchInterval: 30_000 });
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Friend | null>(null);

  const archivedFriendIds = new Set(chatSettingsList.filter((s: ChatSetting) => s.friendId && s.archived).map((s: ChatSetting) => s.friendId));
  const mutedFriendIds = new Set(chatSettingsList.filter((s: ChatSetting) => s.friendId && s.muted).map((s: ChatSetting) => s.friendId));
  const dmUnreadMap = new Map((unread?.dm ?? []).map((d) => [d.friendId, d.count]));
  const lastMsgMap = new Map(lastMessages.map((m) => [m.friendId, m]));
  const activeFriends = friends.filter((f) => !archivedFriendIds.has(f.id));
  const archivedFriends = friends.filter((f) => archivedFriendIds.has(f.id));

  const [onlineOverrides, setOnlineOverrides] = useState<Map<number, { isOnline: boolean; lastSeen?: string }>>(new Map());

  useGlobalEvent("presence_update", (event) => {
    const uid = Number(event.userId);
    const isOn = Boolean(event.isOnline);
    const ls = event.lastSeen ? String(event.lastSeen) : undefined;
    setOnlineOverrides((prev) => {
      const next = new Map(prev);
      next.set(uid, { isOnline: isOn, lastSeen: ls });
      return next;
    });
  });

  const { data: statusList } = useQuery({
    queryKey: ["friends-status"],
    queryFn: getFriendsStatus,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!statusList) return;
    setOnlineOverrides((prev) => {
      const next = new Map(prev);
      for (const s of statusList) {
        next.set(s.id, { isOnline: s.isOnline, lastSeen: s.lastSeen });
      }
      return next;
    });
  }, [statusList]);

  const isOnlineFn = (friend: Friend) => {
    const override = onlineOverrides.get(friend.id);
    return override ? override.isOnline : friend.isOnline;
  };

  const getLastSeen = (friend: Friend) => {
    const override = onlineOverrides.get(friend.id);
    return override?.lastSeen || friend.lastSeen;
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
    queryClient.invalidateQueries({ queryKey: ["last-messages"] });
    queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
  };

  const handleMute = async (friendId: number, duration: "1h" | "8h" | "1w" | "forever") => {
    try {
      await muteChat({ friendId, duration });
      invalidateAll();
      toast({ description: "Chat muted" });
    } catch { toast({ variant: "destructive", description: "Failed to mute" }); }
  };

  const handleUnmute = async (friendId: number) => {
    try {
      await unmuteChat({ friendId });
      invalidateAll();
      toast({ description: "Chat unmuted" });
    } catch { toast({ variant: "destructive", description: "Failed to unmute" }); }
  };

  const handleArchive = async (friendId: number) => {
    try {
      await archiveChat({ friendId });
      invalidateAll();
      toast({ description: "Chat archived" });
    } catch { toast({ variant: "destructive", description: "Failed to archive" }); }
  };

  const handleUnarchive = async (friendId: number) => {
    try {
      await unarchiveChat({ friendId });
      invalidateAll();
      toast({ description: "Chat unarchived" });
    } catch { toast({ variant: "destructive", description: "Failed to unarchive" }); }
  };

  const confirmDeleteChat = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDirectChat(deleteTarget.id);
      invalidateAll();
      toast({ description: "Chat deleted" });
    } catch { toast({ variant: "destructive", description: "Failed to delete chat" }); }
    setDeleteTarget(null);
  };

  const getMenuActions = (friend: Friend, isArchived: boolean): MenuAction => ({
    friend,
    isMuted: mutedFriendIds.has(friend.id),
    isArchived,
    onOpenChat: () => setLocation(`/dm/${friend.id}`),
    onViewProfile: () => setLocation(`/profile/${friend.id}`),
    onMute: (duration) => handleMute(friend.id, duration),
    onUnmute: () => handleUnmute(friend.id),
    onArchive: () => handleArchive(friend.id),
    onUnarchive: () => handleUnarchive(friend.id),
    onDeleteChat: () => setDeleteTarget(friend),
  });

  const renderFriendCard = (friend: Friend, isArchived: boolean) => {
    const online = isOnlineFn(friend);
    const lastSeen = !online ? formatLastSeen(getLastSeen(friend)) : null;
    const muted = mutedFriendIds.has(friend.id);
    const unreadCount = muted ? 0 : (dmUnreadMap.get(friend.id) ?? 0);
    const preview = lastMsgMap.get(friend.id);
    const actions = getMenuActions(friend, isArchived);

    let previewText = "";
    if (preview) {
      const isMe = preview.senderId === user?.id;
      const prefix = isMe ? "You: " : "";
      if (preview.messageType === "image") previewText = prefix + "📷 Photo";
      else if (preview.messageType === "gif") previewText = prefix + "GIF";
      else previewText = prefix + preview.content;
    }

    return (
      <ContextMenu key={friend.id}>
        <ContextMenuTrigger asChild>
          <div
            className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-all duration-200 hover:bg-accent/50 hover:shadow-md ${
              isArchived ? "opacity-60" : ""
            }`}
            onClick={() => setLocation(`/dm/${friend.id}`)}
          >
            {/* Avatar with online indicator */}
            <div className="relative shrink-0">
              <FriendAvatar friend={friend} size={48} />
              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card ${
                  online ? "bg-green-500" : "bg-gray-400"
                }`}
              />
            </div>

            {/* Content area */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate font-semibold leading-tight">{friend.nickname || friend.username}</p>
                  {muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  {isArchived && <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {preview && (
                    <span className={`text-[11px] ${unreadCount > 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                      {formatPreviewTime(preview.createdAt)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-muted-foreground">
                  {previewText || (
                    <span className="flex items-center gap-1">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-green-500" : "bg-gray-400"}`}
                      />
                      {online ? "Online" : lastSeen ? `Last seen ${lastSeen}` : "Offline"}
                    </span>
                  )}
                </p>
                {unreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
            </div>

            {/* Three-dot menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <MenuItems
                  {...actions}
                  MenuItemComponent={DropdownMenuItem}
                  SeparatorComponent={DropdownMenuSeparator}
                  SubComponent={DropdownMenuSub}
                  SubTriggerComponent={DropdownMenuSubTrigger}
                  SubContentComponent={DropdownMenuSubContent}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <MenuItems
            {...actions}
            MenuItemComponent={ContextMenuItem}
            SeparatorComponent={ContextMenuSeparator}
            SubComponent={ContextMenuSub}
            SubTriggerComponent={ContextMenuSubTrigger}
            SubContentComponent={ContextMenuSubContent}
          />
        </ContextMenuContent>
      </ContextMenu>
    );
  };

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
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-[72px] animate-pulse rounded-xl border bg-card" />
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
        <div className="space-y-4">
          {/* Active friends list */}
          <div className="space-y-2">
            {activeFriends.map((friend) => renderFriendCard(friend, false))}
          </div>

          {/* Archived chats section */}
          {archivedFriends.length > 0 && (
            <div>
              <button
                type="button"
                className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowArchived((s) => !s)}
              >
                <Archive className="h-4 w-4" />
                Archived Chats ({archivedFriends.length})
                <span className="text-xs">{showArchived ? "▼" : "▶"}</span>
              </button>
              {showArchived && (
                <div className="space-y-2">
                  {archivedFriends.map((friend) => renderFriendCard(friend, true))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete chat confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat with {deleteTarget?.nickname || deleteTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide all messages in this conversation for you. The other person can still see them. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

