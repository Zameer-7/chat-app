import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Archive, BellOff, Image, MoreVertical, Reply, Search, Trash2, UserX, X } from "lucide-react";
import { wsPaths } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { ChatWindow } from "@/components/chat/chat-window";
import { getDirectMessages, getFriends, searchMessages, bulkDeleteMessages, deleteDirectChat, archiveChat, unarchiveChat, muteChat, unmuteChat, getChatSettings, type ChatMessage, type ChatSetting } from "@/services/chat-api";
import { uploadImage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
const EmojiPicker = lazy(() => import("emoji-picker-react"));

function formatLastSeen(ts: string) {
  if (!ts) return "";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DirectChatPage() {
  const [, params] = useRoute("/dm/:friendId");
  const friendId = Number(params?.friendId || 0);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("hello");
  const [gifs, setGifs] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showMuteOptions, setShowMuteOptions] = useState(false);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  const { data: chatSettingsList = [] } = useQuery({
    queryKey: ["chat-settings"],
    queryFn: getChatSettings,
  });
  const mySetting = chatSettingsList.find((s: ChatSetting) => s.friendId === friendId);
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

  const { data: friends = [], isLoading: friendsLoading } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const friend = friends.find((f) => f.id === friendId);

  const { data: history = [] } = useQuery({
    queryKey: ["dm-messages", friendId],
    queryFn: () => getDirectMessages(friendId),
    enabled: friendId > 0 && Boolean(friend),
    refetchOnMount: "always",
  });

  const wsPath = useCallback((token: string) => wsPaths.direct(friendId, token), [friendId]);
  const { status, lastEvent, send } = useSocket(friend ? wsPath : () => "");

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const tempId = useRef(-1);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLiveMessages([]);
    setReplyTo(null);
    setTypingUsers([]);
  }, [friendId]);

  useEffect(() => {
    if (lastEvent?.type === "direct_message") {
      setLiveMessages((prev) => {
        const withoutTemp = lastEvent.clientMessageId
          ? prev.filter((m: any) => m.id !== Number(lastEvent.clientMessageId))
          : prev;
        return withoutTemp.some((m) => m.id === lastEvent.id) ? withoutTemp : [...withoutTemp, lastEvent];
      });
    }
    if (lastEvent?.type === "message_delivered" || lastEvent?.type === "message_seen") {
      setLiveMessages((prev) =>
        prev.map((m) => (m.id === Number(lastEvent.messageId) ? { ...m, status: lastEvent.type === "message_seen" ? "seen" : "delivered" } : m)),
      );
    }
    if (lastEvent?.type === "message_updated") {
      const msgId = Number(lastEvent.messageId);
      setLiveMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, content: String(lastEvent.content), edited: true, editedAt: lastEvent.editedAt ? String(lastEvent.editedAt) : null }
            : m,
        ),
      );
    }
    if (lastEvent?.type === "reaction_added") {
      setLiveMessages((prev) =>
        prev.map((m) => (m.id === Number(lastEvent.messageId) ? { ...m, reactions: lastEvent.counts?.map((c: any) => ({ reaction: c.reaction, count: c.count })) || [] } : m)),
      );
    }
    if (lastEvent?.type === "message_deleted") {
      const msgId = Number(lastEvent.messageId);
      if (lastEvent.scope === "everyone") {
        setLiveMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, deleted: true, content: "This message was deleted" } : m)),
        );
      } else if (lastEvent.scope === "me" && lastEvent.userId === user?.id) {
        setLiveMessages((prev) => prev.filter((m) => m.id !== msgId));
      }
    }
    if (lastEvent?.type === "typing") {
      const uname = String(lastEvent.username || "");
      if (!uname) return;
      if (lastEvent.isTyping) {
        setTypingUsers((prev) => (prev.includes(uname) ? prev : [...prev, uname]));
      } else {
        setTypingUsers((prev) => prev.filter((u) => u !== uname));
      }
    }
  }, [lastEvent]);

  useEffect(() => {
    if (!showEmoji) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showEmoji]);

  const messages = useMemo(() => {
    const byId = new Map<number, ChatMessage>();
    history.forEach((m) => byId.set(m.id, m));
    liveMessages.forEach((m) => byId.set(m.id, m));
    return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [history, liveMessages]);

  const optimisticInsert = (payload: Partial<ChatMessage>) => {
    const id = tempId.current--;
    setLiveMessages((prev) => [
      ...prev,
      {
        id,
        roomId: null,
        senderId: user!.id,
        receiverId: friendId,
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

  const handleTextChange = (value: string) => {
    setText(value);
    if (status === "connected") {
      send({ type: "typing", isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        send({ type: "typing", isTyping: false });
      }, 1500);
    }
  };

  const canSend = Boolean(text.trim()) && status === "connected";

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchMessages(query.trim(), undefined, friendId);
        setSearchResults(results);
      } catch {}
    }, 400);
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
    send({ type: "direct_message", content: text.trim(), clientMessageId, replyToId: replyTo?.id ?? null });
    setText("");
    setReplyTo(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";
    setImageUploading(true);
    try {
      const { url } = await uploadImage(file);
      const clientMessageId = optimisticInsert({ messageType: "image", gifUrl: url, content: "" });
      send({ type: "direct_message", gifUrl: url, messageType: "image", clientMessageId });
    } catch (err) {
      console.error("Image upload failed:", (err as Error).message);
    } finally {
      setImageUploading(false);
    }
  };

  const fetchGifs = async (query: string) => {
    const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=12`);
    const data = await res.json();
    setGifs((data.results || []).map((r: any) => r.media?.[0]?.gif?.url).filter(Boolean));
  };

  return (
    <div className="space-y-4">
      {/* Not-friends guard */}
      {!friendsLoading && !friend && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <UserX className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">You can't message this user</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You need to be friends before you can start a conversation.
            </p>
          </div>
          <Button size="sm" onClick={() => setLocation("/search")}>
            Find Friends
          </Button>
        </div>
      )}

      {/* Header with back button */}
      {friend && (<>
      <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setLocation("/friends")}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            title="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-black truncate">Chat with {friend?.nickname || `User ${friendId}`}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${friend?.isOnline ? "bg-green-500" : "bg-gray-400"}`} />
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {friend?.isOnline
              ? "Online"
              : friend?.lastSeen
                ? `Last seen ${formatLastSeen(friend.lastSeen)}`
                : "Offline"}
          </span>
          {isMuted && <span className="text-sm" title="Muted">🔕</span>}
          {isArchived && <span className="text-sm" title="Archived">📦</span>}
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground touch-manipulation"
            title="Search messages"
            onClick={() => { setShowSearch((s) => !s); setSearchQuery(""); setSearchResults([]); }}
          >
            <Search className="h-4 w-4" />
          </button>
          {/* Chat options menu */}
          <div className="relative" ref={chatMenuRef}>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground touch-manipulation"
              title="Chat options"
              onClick={() => { setShowChatMenu((s) => !s); setShowMuteOptions(false); }}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {showChatMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-card shadow-lg z-50">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                  onClick={() => { setShowSearch(true); setShowChatMenu(false); }}
                >
                  <Search className="h-4 w-4" /> Search messages
                </button>
                {!showMuteOptions ? (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                    onClick={() => {
                      if (isMuted) {
                        unmuteChat({ friendId }).then(() => {
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
                          muteChat({ friendId, duration: val }).then(() => {
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
                    fn({ friendId }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["chat-settings"] });
                      toast({ title: isArchived ? "Chat unarchived" : "Chat archived" });
                      setShowChatMenu(false);
                      if (!isArchived) setLocation("/friends");
                    });
                  }}
                >
                  <Archive className="h-4 w-4" /> {isArchived ? "Unarchive chat" : "Archive chat"}
                </button>
                {!confirmDeleteChat ? (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive"
                    onClick={() => setConfirmDeleteChat(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete chat
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-xs text-muted-foreground">Delete entire chat?</p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="rounded bg-destructive text-destructive-foreground px-2 py-1 text-xs font-medium"
                        onClick={() => {
                          deleteDirectChat(friendId).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["dm-messages", friendId] });
                            toast({ title: "Chat deleted" });
                            setShowChatMenu(false);
                            setConfirmDeleteChat(false);
                            setLocation("/friends");
                          });
                        }}
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        className="rounded bg-secondary text-secondary-foreground px-2 py-1 text-xs font-medium"
                        onClick={() => setConfirmDeleteChat(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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

      <ChatWindow
        messages={messages}
        currentUserId={user!.id}
        onReact={(messageId, reaction) => send({ type: "reaction_add", messageId, reaction })}
        onDelete={(messageId, scope) => send({ type: "message_delete", messageId, scope })}
        onReply={(message) => setReplyTo(message)}
        onEdit={(messageId, content) => send({ type: "message_edit", messageId, content })}
        typingUsers={typingUsers}
        onBulkDelete={async (ids, scope) => {
          try {
            await bulkDeleteMessages(ids, scope);
            if (scope === "me") {
              setLiveMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
            } else {
              setLiveMessages((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, deleted: true, content: "This message was deleted" } : m));
            }
            queryClient.invalidateQueries({ queryKey: ["dm-messages", friendId] });
            toast({ title: `${ids.length} message${ids.length > 1 ? "s" : ""} deleted` });
          } catch (err: any) {
            toast({ title: err.message || "Failed to delete messages", variant: "destructive" });
          }
        }}
      />

      {/* Sticky bottom: emoji, GIF, reply preview, form */}
      <div className="sticky bottom-0 z-10 bg-background border-t pt-2 -mx-3 px-3 space-y-2 pb-2">
        {showEmoji && (
          <div ref={emojiPickerRef} className="rounded-xl border bg-card overflow-hidden">
            <Suspense fallback={<div className="h-[350px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
              <EmojiPicker onEmojiClick={(emoji) => setText((prev) => prev + emoji.emoji)} width="100%" />
            </Suspense>
          </div>
        )}

        {showGif && (
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <div className="flex gap-2">
              <Input value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Search GIFs" className="text-base" />
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
                    send({ type: "direct_message", gifUrl: gif, clientMessageId });
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
              <p className="text-xs text-muted-foreground truncate">{replyTo.content || (replyTo.gifUrl ? "Image" : "...")}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Hidden image file input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="hidden"
          onChange={handleImageUpload}
        />

        <form className="flex items-center gap-1.5" onSubmit={handleSend}>
          <button
            type="button"
            disabled={imageUploading}
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
          <Input value={text} onChange={(e) => handleTextChange(e.target.value)} placeholder="Type a direct message" className="flex-1 text-base" />
          <Button type="submit" disabled={!canSend} className="min-h-[44px] shrink-0 touch-manipulation">Send</Button>
        </form>
      </div>
      </>)}
    </div>
  );
}
