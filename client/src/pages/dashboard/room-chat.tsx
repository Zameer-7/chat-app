import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import EmojiPicker from "emoji-picker-react";
import { ArrowLeft, Check, Crown, Info, Link2, Pencil, Reply, Users, X } from "lucide-react";
import { wsPaths } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { ChatWindow } from "@/components/chat/chat-window";
import {
  deleteRoom,
  getJoinedRooms,
  getRoom,
  getRoomMembers,
  getRoomMessages,
  getRoomStats,
  joinRoom,
  leaveRoom,
  renameRoom,
  type ChatMessage,
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
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const tempId = useRef(-1);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

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
            <Button variant={showInfo ? "secondary" : "ghost"} size="sm" onClick={() => setShowInfo((s) => !s)} title="Room info">
              <Info className="h-4 w-4" />
            </Button>
            <Button variant={showMembers ? "secondary" : "ghost"} size="sm" onClick={() => setShowMembers((s) => !s)} title="Members">
              <Users className="h-4 w-4" />
            </Button>
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
          <h3 className="font-semibold text-sm">Members ({members.length})</h3>
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

      {/* Chat */}
      <ChatWindow
        messages={messages}
        currentUserId={user!.id}
        onReact={(messageId, reaction) => send({ type: "reaction_add", messageId, reaction })}
        onDelete={(messageId, scope) => send({ type: "message_delete", messageId, scope })}
        onReply={(message) => setReplyTo(message)}
        onLoadMore={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        isLoadingMore={isFetchingNextPage}
        hasMore={hasNextPage !== false}
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

      {/* Emoji picker */}
      {showEmoji && (
        <div ref={emojiPickerRef} className="rounded-xl border bg-card p-2 w-fit">
          <EmojiPicker onEmojiClick={(emoji) => setText((prev) => prev + emoji.emoji)} />
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
              onKeyDown={(e) => { if (e.key === "Enter") fetchGifs(gifQuery); }}
            />
            <Button type="button" onClick={() => fetchGifs(gifQuery)}>Search</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
            {gifs.map((gif) => (
              <button
                key={gif}
                type="button"
                className="rounded-lg overflow-hidden border"
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
          <button type="button" onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Send form */}
      <form className="flex items-center gap-2 p-0" onSubmit={handleSend}>
        <Button type="button" variant="secondary" onClick={() => setShowGif((s) => !s)}>GIF</Button>
        <Button type="button" variant="secondary" onClick={() => setShowEmoji((s) => !s)}>😊</Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={left ? "You left this room" : "Type a room message"}
          disabled={left}
          className="flex-1 h-10"
        />
        <Button type="submit" disabled={!canSend}>Send</Button>
      </form>
    </div>
  );
}
