import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import EmojiPicker from "emoji-picker-react";
import { ArrowLeft, Image, Reply, X } from "lucide-react";
import { wsPaths } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { ChatWindow } from "@/components/chat/chat-window";
import { getDirectMessages, getFriends, type ChatMessage } from "@/services/chat-api";
import { uploadImage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DirectChatPage() {
  const [, params] = useRoute("/dm/:friendId");
  const friendId = Number(params?.friendId || 0);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("hello");
  const [gifs, setGifs] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });
  const friend = friends.find((f) => f.id === friendId);

  const { data: history = [] } = useQuery({
    queryKey: ["dm-messages", friendId],
    queryFn: () => getDirectMessages(friendId),
    enabled: friendId > 0,
    refetchOnMount: "always",
  });

  const wsPath = useCallback((token: string) => wsPaths.direct(friendId, token), [friendId]);
  const { status, lastEvent, send } = useSocket(wsPath);

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const tempId = useRef(-1);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/friends")}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-2xl font-black">Chat with {friend?.nickname || `User ${friendId}`}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${friend?.isOnline ? "bg-green-500" : "bg-gray-400"}`} />
          <span className="text-sm text-muted-foreground">{friend?.isOnline ? "Online" : "Offline"}</span>
        </div>
      </div>

      <ChatWindow
        messages={messages}
        currentUserId={user!.id}
        onReact={(messageId, reaction) => send({ type: "reaction_add", messageId, reaction })}
        onDelete={(messageId, scope) => send({ type: "message_delete", messageId, scope })}
        onReply={(message) => setReplyTo(message)}
        typingUsers={typingUsers}
      />

      {showEmoji && (
        <div ref={emojiPickerRef} className="rounded-xl border bg-card p-2 w-fit">
          <EmojiPicker onEmojiClick={(emoji) => setText((prev) => prev + emoji.emoji)} />
        </div>
      )}

      {showGif && (
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <div className="flex gap-2">
            <Input value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Search GIFs" />
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
          <button type="button" onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
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

      <form className="flex gap-2" onSubmit={handleSend}>
        <Button
          type="button"
          variant="secondary"
          disabled={imageUploading}
          onClick={() => imageInputRef.current?.click()}
          title="Send image"
        >
          <Image className="h-4 w-4" />
        </Button>
        <Button type="button" variant="secondary" onClick={() => setShowGif((s) => !s)}>GIF</Button>
        <Button type="button" variant="secondary" onClick={() => setShowEmoji((s) => !s)}>😊</Button>
        <Input value={text} onChange={(e) => handleTextChange(e.target.value)} placeholder="Type a direct message" />
        <Button type="submit" disabled={!canSend}>Send</Button>
      </form>
    </div>
  );
}
