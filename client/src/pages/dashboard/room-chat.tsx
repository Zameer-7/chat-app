import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Archive, BellOff, Check, Crown, Image, Info, Link2, MoreVertical, Pencil, Reply, Search, UserPlus, Users, X } from "lucide-react";
import { wsPaths } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { ChatWindow } from "@/components/chat/chat-window";
import { uploadImage } from "@/services/api";
const EmojiPicker = lazy(() => import("emoji-picker-react"));
import {
  addMembersToRoom,
  deleteRoom,
  getFriends,
  getJoinedRooms,
  getRoom,
  getRoomMembers,
  getRoomMessages,
  getRoomStats,
  joinRoom,
  leaveRoom,
  renameRoom,
  searchMessages,
  bulkDeleteMessages,
  archiveChat,
  unarchiveChat,
  muteChat,
  unmuteChat,
  getChatSettings,
  type ChatMessage,
  type ChatSetting,
} from "@/services/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function RoomChatPage() {
  const [, params] = useRoute("/rooms/:id");
  const roomId = params?.id || "";
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("hello");
  const [gifs, setGifs] = useState<string[]>([]);
  const [left, setLeft] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const tempId = useRef(-1);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showMuteOptions, setShowMuteOptions] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const [showAddMembers, setShowAddMembers] = useState(false);

  const { data: chatSettingsList = [] } = useQuery({
    queryKey: ["chat-settings"],
    queryFn: getChatSettings,
  });
  const mySetting = chatSettingsList.find((s: ChatSetting) => s.roomId === roomId);
  const isArchived = mySetting?.archived ?? false;
  const isMuted = mySetting?.muted ?? false;

  // Close chat menu on outside click
  useEffect(() => {
    if (!showChatMenu) return;
    const handle = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setShowChatMenu(false);
        setShowMuteOptions(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showChatMenu]);

  const PAGE_SIZE = 30;

  const { data: room, isError: roomNotFound } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoom(roomId),
    enabled: Boolean(roomId),
    retry: false,
  });
  const { data: stats } = useQuery({
    queryKey: ["room-stats", roomId],
    queryFn: () => getRoomStats(roomId),
    enabled: Boolean(roomId),
    refetchInterval: 10_000,
  });
  const {
    data: historyPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["room-messages", roomId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getRoomMessages(roomId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      // oldest message timestamp in the page (page comes DESC from server, reversed below)
      const oldest = lastPage.reduce((a, b) =>
        new Date(a.createdAt).getTime() < new Date(b.createdAt).getTime() ? a : b,
      );
      return oldest.createdAt;
    },
    enabled: Boolean(roomId),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const history = useMemo(() => {
    if (!historyPages) return [];
    // Server returns DESC per page; reverse each page and flatten
    return historyPages.pages
      .flatMap((page) => [...page].reverse())
      // De-duplicate across pages
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [historyPages]);
  const { data: members = [] } = useQuery({
    queryKey: ["room-members", roomId],
    queryFn: () => getRoomMembers(roomId),
    enabled: Boolean(roomId) && (showMembers || showInfo),
    staleTime: 30_000,
  });
  const { data: allRooms = [] } = useQuery({
    queryKey: ["joined-rooms"],
    queryFn: getJoinedRooms,
    staleTime: 60_000,
  });

  const wsPath = useCallback((token: string) => wsPaths.room(roomId, token), [roomId]);
  const { status, lastEvent, send } = useSocket(wsPath);

  useEffect(() => {
    const myMembership = allRooms.find((r) => r.roomId === roomId);
    if (myMembership !== undefined) setLeft(myMembership.leftAt !== null);
  }, [roomId, allRooms]);

  useEffect(() => {
    setLiveMessages([]);
    setLeft(false);
    setIsRenaming(false);
    setShowInfo(false);
    setShowMembers(false);
    setConfirmDelete(false);
    setReplyTo(null);
    setTypingUsers([]);
  }, [roomId]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "room_deleted") {
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      toast({ title: "This room was deleted by the creator." });
      setLocation("/rooms");
      return;
    }
    if (lastEvent.type === "room_renamed") {
      queryClient.setQueryData(["room", roomId], (old: any) =>
        old ? { ...old, roomName: lastEvent.roomName } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      return;
    }
    if (lastEvent.type === "user_joined" || lastEvent.type === "user_left") {
      queryClient.invalidateQueries({ queryKey: ["room-members", roomId] });
      queryClient.invalidateQueries({ queryKey: ["room-stats", roomId] });
      return;
    }
    if (lastEvent.type === "room_message") {
      setLiveMessages((prev) => {
        const withoutTemp = lastEvent.clientMessageId
          ? prev.filter((m: any) => m.id !== Number(lastEvent.clientMessageId))
          : prev;
        return withoutTemp.some((m) => m.id === lastEvent.id) ? withoutTemp : [...withoutTemp, lastEvent];
      });
      return;
    }
    if (lastEvent.type === "message_delivered" || lastEvent.type === "message_seen") {
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === Number(lastEvent.messageId)
            ? { ...m, status: lastEvent.type === "message_seen" ? "seen" : "delivered" }
            : m,
        ),
      );
      return;
    }
    if (lastEvent.type === "message_updated") {
      const msgId = Number(lastEvent.messageId);
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, content: String(lastEvent.content), edited: true, editedAt: lastEvent.editedAt ? String(lastEvent.editedAt) : null }
            : m,
        ),
      );
      return;
    }
    if (lastEvent.type === "reaction_added") {
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === Number(lastEvent.messageId)
            ? { ...m, reactions: lastEvent.counts?.map((c: any) => ({ reaction: c.reaction, count: c.count })) || [] }
            : m,
        ),
      );
    }
    if (lastEvent.type === "message_deleted") {
      const msgId = Number(lastEvent.messageId);
      if (lastEvent.scope === "everyone") {
        // Mark as deleted in both live and cached history
        setLiveMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, deleted: true, content: "This message was deleted" } : m)),
        );
        queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
      } else if (lastEvent.scope === "me" && lastEvent.userId === user?.id) {
        // Remove from view for current user
        setLiveMessages((prev) => prev.filter((m) => m.id !== msgId));
        queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
      }
    }
    if (lastEvent.type === "typing") {
      const uname = String(lastEvent.username || "");
      if (!uname) return;
      if (lastEvent.isTyping) {
        setTypingUsers((prev) => (prev.includes(uname) ? prev : [...prev, uname]));
      } else {
        setTypingUsers((prev) => prev.filter((u) => u !== uname));
      }
    }
  }, [lastEvent, roomId, queryClient, setLocation, toast]);

  useEffect(() => {
    if (!showEmoji) return;
    const handle = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showEmoji]);

  const messages = useMemo(() => {
    const byId = new Map<number, ChatMessage>();
    history.forEach((m) => byId.set(m.id, m));
    liveMessages.forEach((m) => byId.set(m.id, m));
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [history, liveMessages]);

  const canSend = Boolean(text.trim()) && status === "connected" && !left;
  const isOwner = room?.createdBy === user?.id;
  const displayName = room?.roomName || room?.id || roomId;

  const handleTextChange = (value: string) => {
    setText(value);
    if (status === "connected" && !left) {
      send({ type: "typing", isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        send({ type: "typing", isTyping: false });
      }, 1500);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchMessages(query.trim(), roomId);
        setSearchResults(results);
      } catch {}
    }, 400);
  };

  const optimisticInsert = (payload: Partial<ChatMessage>) => {
    const id = tempId.current--;
    setLiveMessages((prev) => [
      ...prev,
      {
        id,
        roomId,
        senderId: user!.id,
        receiverId: null,
        senderNickname: user!.nickname,
        content: payload.content || "",
        messageType: payload.messageType || "text",
        gifUrl: payload.gifUrl || null,
        replyToId: payload.replyToId || null,
        replyToContent: payload.replyToContent || null,
        replyToNickname: payload.replyToNickname || null,
        status: "sent",
        createdAt: new Date().toISOString(),
        reactions: [],
      },
    ]);
    return String(id);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    // Stop typing indicator immediately on send
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    send({ type: "typing", isTyping: false });
    const clientMessageId = optimisticInsert({
      content: text.trim(),
      replyToId: replyTo?.id,
      replyToContent: replyTo?.content,
      replyToNickname: replyTo?.senderNickname,
    });
    send({ type: "room_message", content: text.trim(), clientMessageId, replyToId: replyTo?.id || null });
    setText("");
    setReplyTo(null);
  };

  const handleRoomImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImageUploading(true);
    try {
      const { url } = await uploadImage(file);
      const clientMessageId = optimisticInsert({ messageType: "image", gifUrl: url, content: "" });
      send({ type: "room_message", gifUrl: url, messageType: "image", clientMessageId });
    } catch (err) {
      console.error("Image upload failed:", (err as Error).message);
    } finally {
      setImageUploading(false);
    }
  };

  const fetchGifs = async (query: string) => {
    const res = await fetch(
      `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=12`,
    );
    const data = await res.json();
    setGifs((data.results || []).map((r: any) => r.media?.[0]?.gif?.url).filter(Boolean));
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/rooms/${roomId}`);
    toast({ title: "Invite link copied!" });
  };

  const leaveMutation = useMutation({
    mutationFn: () => leaveRoom(roomId),
    onSuccess: () => {
      setLeft(true);
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      toast({ title: "You left the room." });
    },
    onError: () => toast({ title: "Failed to leave room", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRoom(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      toast({ title: "Room deleted." });
      setLocation("/rooms");
    },
    onError: (err: any) => toast({ title: err.message || "Failed to delete room", variant: "destructive" }),
  });

  const rejoinMutation = useMutation({
    mutationFn: () => joinRoom(roomId),
    onSuccess: () => {
      setLeft(false);
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
      toast({ title: "You rejoined the room." });
    },
    onError: () => toast({ title: "Failed to rejoin room", variant: "destructive" }),
  });

  const renameMutation = useMutation({
    mutationFn: (newName: string) => renameRoom(roomId, newName),
    onSuccess: (updated) => {
      queryClient.setQueryData(["room", roomId], (old: any) =>
        old ? { ...old, roomName: updated.roomName } : old,
      );
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      setIsRenaming(false);
      toast({ title: "Room renamed." });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to rename room", variant: "destructive" }),
  });

  if (roomNotFound) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">This room no longer exists.</p>
        <Button onClick={() => setLocation("/rooms")}>Back to Rooms</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-2xl border bg-card px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setLocation("/rooms")}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Back to Rooms"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              {isRenaming ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 text-sm w-44"
                    maxLength={50}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editName.trim()) renameMutation.mutate(editName.trim());
                      if (e.key === "Escape") { setIsRenaming(false); setEditName(""); }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!editName.trim() || renameMutation.isPending}
                    onClick={() => renameMutation.mutate(editName.trim())}
                    className="text-green-500 hover:text-green-600 disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsRenaming(false); setEditName(""); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="text-base font-black leading-tight truncate max-w-[220px]">{displayName}</h2>
                  {isOwner && (
                    <button
                      type="button"
                      title="Rename room"
                      onClick={() => { setEditName(displayName); setIsRenaming(true); }}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground font-mono">
                ID: {roomId} · {stats?.participants ?? 0} members · {stats?.online ?? 0} online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={handleCopyInvite} title="Copy invite link">
              <Link2 className="h-4 w-4" />
            </Button>
            <Button variant={showSearch ? "secondary" : "ghost"} size="sm" onClick={() => { setShowSearch((s) => !s); setSearchQuery(""); setSearchResults([]); }} title="Search messages">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant={showInfo ? "secondary" : "ghost"} size="sm" onClick={() => setShowInfo((s) => !s)} title="Room info">
              <Info className="h-4 w-4" />
            </Button>
            <Button variant={showMembers ? "secondary" : "ghost"} size="sm" onClick={() => setShowMembers((s) => !s)} title="Members">
              <Users className="h-4 w-4" />
            </Button>
            {isMuted && <span className="text-sm" title="Muted">🔕</span>}
            {isArchived && <span className="text-sm" title="Archived">📦</span>}
            {/* Chat options menu */}
            <div className="relative" ref={chatMenuRef}>
              <Button variant={showChatMenu ? "secondary" : "ghost"} size="sm" onClick={() => { setShowChatMenu((s) => !s); setShowMuteOptions(false); }} title="Chat options">
                <MoreVertical className="h-4 w-4" />
              </Button>
              {showChatMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-card shadow-lg z-50">
                  {!showMuteOptions ? (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                      onClick={() => {
                        if (isMuted) {
                          unmuteChat({ roomId }).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
                            toast({ title: "Chat unmuted" });
                            setShowChatMenu(false);
                          });
                        } else {
                          setShowMuteOptions(true);
                        }
                      }}
                    >
                      <BellOff className="h-4 w-4" /> {isMuted ? "Unmute chat" : "Mute chat"}
                    </button>
                  ) : (
                    <div className="px-1 py-1 space-y-0.5">
                      {([["1h", "1 hour"], ["8h", "8 hours"], ["1w", "1 week"], ["forever", "Forever"]] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          className="w-full px-3 py-1.5 text-xs hover:bg-muted rounded text-left"
                          onClick={() => {
                            muteChat({ roomId, duration: val }).then(() => {
                              queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
                              toast({ title: `Chat muted for ${label.toLowerCase()}` });
                              setShowChatMenu(false);
                              setShowMuteOptions(false);
                            });
                          }}
                        >
                          Mute {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                    onClick={() => {
                      const fn = isArchived ? unarchiveChat : archiveChat;
                      fn({ roomId }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
                        toast({ title: isArchived ? "Room unarchived" : "Room archived" });
                        setShowChatMenu(false);
                      });
                    }}
                  >
                    <Archive className="h-4 w-4" /> {isArchived ? "Unarchive room" : "Archive room"}
                  </button>
                </div>
              )}
            </div>
            {!left && (
              <Button variant="secondary" size="sm" disabled={leaveMutation.isPending} onClick={() => leaveMutation.mutate()}>
                Leave
              </Button>
            )}
            {isOwner && !confirmDelete && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
            {isOwner && confirmDelete && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Sure?</span>
                <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>Yes</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Room Info Panel */}
      {showInfo && (
        <div className="rounded-2xl border bg-card px-4 py-3 space-y-2">
          <h3 className="font-semibold text-sm">Room Info</h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{room?.roomName || "—"}</span>
            <span className="text-muted-foreground">Room ID</span>
            <span className="font-mono text-xs">{roomId}</span>
            <span className="text-muted-foreground">Created by</span>
            <span>{room?.creatorNickname || "—"}</span>
            <span className="text-muted-foreground">Members</span>
            <span>{members.length || stats?.participants || "—"}</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleCopyInvite} className="gap-2 mt-1">
            <Link2 className="h-3.5 w-3.5" />
            Copy Invite Link
          </Button>
        </div>
      )}

      {/* Members Panel */}
      {showMembers && (
        <div className="rounded-2xl border bg-card px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Members ({members.length})</h3>
            {!left && (
              <Button
                variant={showAddMembers ? "secondary" : "outline"}
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={() => setShowAddMembers((s) => !s)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </Button>
            )}
          </div>
          {members.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center gap-2.5 text-sm">
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold select-none">
                      {m.nickname[0]?.toUpperCase() || "?"}
                    </div>
                    {m.isOnline && !m.leftAt && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 ring-1 ring-background" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="truncate font-medium">{m.nickname}</span>
                    {m.userId === room?.createdBy && (
                      <span className="inline-flex items-center gap-0.5 shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">
                        <Crown className="h-2.5 w-2.5" />
                        Owner
                      </span>
                    )}
                    {m.leftAt && <span className="text-[10px] text-muted-foreground shrink-0">(left)</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Members Panel */}
      {showAddMembers && <AddMembersPanel roomId={roomId} members={members} onClose={() => setShowAddMembers(false)} />}

      {/* Search bar */}
      {showSearch && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search messages…"
              className="flex-1 h-8 text-sm text-base"
            />
            <button type="button" className="text-muted-foreground hover:text-foreground p-1 min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation" onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="rounded-xl border bg-card p-2 max-h-52 overflow-y-auto space-y-0.5 shadow-md">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted text-sm transition-colors"
                  onClick={() => {
                    const el = document.getElementById(`message-${m.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <p className="text-[11px] font-semibold text-muted-foreground">{m.senderNickname}</p>
                  <p className="truncate">{m.content}</p>
                </button>
              ))}
              <p className="text-xs text-muted-foreground text-center py-1">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""}</p>
            </div>
          )}
          {searchQuery.trim().length >= 2 && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No results found.</p>
          )}
        </div>
      )}

      {/* Chat */}
      <ChatWindow
        messages={messages}
        currentUserId={user!.id}
        onReact={(messageId, reaction) => send({ type: "reaction_add", messageId, reaction })}
        onDelete={(messageId, scope) => send({ type: "message_delete", messageId, scope })}
        onReply={(message) => setReplyTo(message)}
        onEdit={(messageId, content) => send({ type: "message_edit", messageId, content })}
        onLoadMore={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        isLoadingMore={isFetchingNextPage}
        hasMore={hasNextPage !== false}
        typingUsers={typingUsers}
        onBulkDelete={async (ids, scope) => {
          try {
            await bulkDeleteMessages(ids, scope);
            if (scope === "me") {
              setLiveMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
            } else {
              setLiveMessages((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, deleted: true, content: "This message was deleted" } : m));
            }
            queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
            toast({ title: `${ids.length} message${ids.length > 1 ? "s" : ""} deleted` });
          } catch (err: any) {
            toast({ title: err.message || "Failed to delete messages", variant: "destructive" });
          }
        }}
      />

      {/* Left-room banner */}
      {left && (
        <div className="flex items-center justify-between rounded-xl border border-yellow-400/40 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-300">
          <span>You left this room. Rejoin to send messages.</span>
          <Button size="sm" variant="secondary" onClick={() => rejoinMutation.mutate()} disabled={rejoinMutation.isPending}>
            Rejoin
          </Button>
        </div>
      )}

      {/* Sticky bottom: emoji picker, GIF picker, reply preview, send form */}
      <div className="sticky bottom-0 z-10 bg-background border-t pt-2 -mx-3 px-3 space-y-2 pb-2">
        {/* Emoji picker */}
        {showEmoji && (
          <div ref={emojiPickerRef} className="rounded-xl border bg-card overflow-hidden">
            <Suspense fallback={<div className="h-[350px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
              <EmojiPicker onEmojiClick={(emoji) => setText((prev) => prev + emoji.emoji)} width="100%" />
            </Suspense>
          </div>
        )}

        {/* GIF picker */}
        {showGif && (
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="Search GIFs"
                className="text-base"
                onKeyDown={(e) => { if (e.key === "Enter") fetchGifs(gifQuery); }}
              />
              <Button type="button" onClick={() => fetchGifs(gifQuery)}>Search</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {gifs.map((gif) => (
                <button
                  key={gif}
                  type="button"
                  className="rounded-lg overflow-hidden border min-h-[80px] touch-manipulation"
                  onClick={() => {
                    const clientMessageId = optimisticInsert({ messageType: "gif", gifUrl: gif, content: "" });
                    send({ type: "room_message", gifUrl: gif, clientMessageId });
                    setShowGif(false);
                  }}
                >
                  <img src={gif} alt="gif" className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2 text-sm">
            <Reply className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary">{replyTo.senderNickname}</p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.content || (replyTo.gifUrl ? "GIF" : "...")}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Send form */}
        <form className="flex items-center gap-1.5" onSubmit={handleSend}>
          {/* Hidden image file input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            onChange={handleRoomImageUpload}
          />
          <button
            type="button"
            disabled={left || imageUploading}
            onClick={() => imageInputRef.current?.click()}
            title="Send image"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors shrink-0 touch-manipulation disabled:opacity-50"
          >
            <Image className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowGif((s) => !s)}
            className="min-h-[44px] px-2 flex items-center justify-center rounded-lg border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors shrink-0 touch-manipulation"
          >GIF</button>
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-base transition-colors shrink-0 touch-manipulation"
          >😊</button>
          <Input
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={left ? "You left this room" : "Type a message…"}
            disabled={left}
            className="flex-1 h-10 text-base"
          />
          <Button type="submit" disabled={!canSend} className="min-h-[44px] shrink-0 touch-manipulation">Send</Button>
        </form>
      </div>
    </div>
  );
}

/* ─── Add Members Panel (extracted for clarity) ─── */

function AddMembersPanel({
  roomId,
  members,
  onClose,
}: {
  roomId: string;
  members: { userId: number; nickname: string; leftAt: string | null }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);

  const { data: friends = [], isLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: getFriends,
  });

  const activeMemberIds = new Set(
    members.filter((m) => !m.leftAt).map((m) => m.userId),
  );

  const inviteable = friends.filter((f: any) => !activeMemberIds.has(f.id));

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const mutation = useMutation({
    mutationFn: () => addMembersToRoom(roomId, selected),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room-members", roomId] });
      queryClient.invalidateQueries({ queryKey: ["room-stats", roomId] });
      toast({ title: `${selected.length} member${selected.length > 1 ? "s" : ""} added!` });
      setSelected([]);
      onClose();
    },
    onError: (err: any) =>
      toast({ title: err.message || "Failed to add members", variant: "destructive" }),
  });

  return (
    <div className="rounded-2xl border bg-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Add Friends to Room</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading friends…</p>
      ) : inviteable.length === 0 ? (
        <p className="text-xs text-muted-foreground">All your friends are already in this room.</p>
      ) : (
        <>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {inviteable.map((f: any) => {
              const checked = selected.includes(f.id);
              return (
                <label
                  key={f.id}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                    checked ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary h-4 w-4"
                    checked={checked}
                    onChange={() => toggle(f.id)}
                  />
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold select-none shrink-0">
                    {(f.nickname || f.username)?.[0]?.toUpperCase() || "?"}
                  </div>
                  <span className="text-sm font-medium truncate">
                    {f.nickname || f.username}
                  </span>
                </label>
              );
            })}
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={selected.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {mutation.isPending
              ? "Adding…"
              : `Add ${selected.length} Friend${selected.length !== 1 ? "s" : ""}`}
          </Button>
        </>
      )}
    </div>
  );
}
