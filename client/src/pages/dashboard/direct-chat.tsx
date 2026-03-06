import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import EmojiPicker from "emoji-picker-react";
import { wsPaths } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { ChatWindow } from "@/components/chat/chat-window";
import { getDirectMessages, getFriends, type ChatMessage } from "@/services/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DirectChatPage() {
  const [, params] = useRoute("/dm/:friendId");
  const friendId = Number(params?.friendId || 0);
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("hello");
  const [gifs, setGifs] = useState<string[]>([]);

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
  const tempId = useRef(-1);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLiveMessages([]);
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
        status: "sent",
        createdAt: new Date().toISOString(),
        reactions: [],
      },
    ]);
    return String(id);
  };

  const canSend = Boolean(text.trim()) && status === "connected";
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    const clientMessageId = optimisticInsert({ content: text.trim() });
    send({ type: "direct_message", content: text.trim(), clientMessageId });
    setText("");
  };

  const fetchGifs = async (query: string) => {
    const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=12`);
    const data = await res.json();
    setGifs((data.results || []).map((r: any) => r.media?.[0]?.gif?.url).filter(Boolean));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Chat with {friend?.nickname || `User ${friendId}`}</h2>
        <p className="text-sm text-muted-foreground">{friend?.isOnline ? "Online" : "Offline"}</p>
      </div>

      <ChatWindow
        messages={messages}
        currentUserId={user!.id}
        onReact={(messageId, reaction) => send({ type: "reaction_add", messageId, reaction })}
      />
      <p className="text-xs text-muted-foreground px-1">Typing indicator area</p>

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

      <form className="flex gap-2" onSubmit={handleSend}>
        <Button type="button" variant="secondary" onClick={() => setShowGif((s) => !s)}>GIF</Button>
        <Button type="button" variant="secondary" onClick={() => setShowEmoji((s) => !s)}>😊</Button>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a direct message" />
        <Button type="submit" disabled={!canSend}>Send</Button>
      </form>
    </div>
  );
}
