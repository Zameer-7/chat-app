import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/services/chat-api";

type MenuState = { messageId: number; x: number; y: number } | null;
type ReactionMenuState = { messageId: number; x: number; y: number } | null;

const CONTEXT_MENU_WIDTH = 176;
const REACTION_MENU_WIDTH = 300;

const reactionOptions = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F525}", "\u{1F389}"];

function toViewportPosition(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - height - 8);

  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY),
  };
}

function renderStatus(status: ChatMessage["status"]) {
  if (status === "sent") {
    return <span className="ml-1 text-[11px] text-gray-400">✓</span>;
  }
  if (status === "delivered") {
    return <span className="ml-1 text-[11px] text-gray-400">✓✓</span>;
  }
  return <span className="ml-1 text-[11px] text-blue-500">✓✓</span>;
}

export function ChatWindow({
  messages,
  currentUserId,
  onReact,
  onDelete,
  onReply,
  onLoadMore,
  isLoadingMore,
  hasMore,
}: {
  messages: ChatMessage[];
  currentUserId: number;
  onReact?: (messageId: number, reaction: string) => void;
  onDelete?: (messageId: number, scope: "me" | "everyone") => void;
  onReply?: (message: ChatMessage) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [reactionMenu, setReactionMenu] = useState<ReactionMenuState>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const isInitialLoadRef = useRef(true);

  const contextMessage = useMemo(
    () => messages.find((message) => message.id === menu?.messageId),
    [menu?.messageId, messages],
  );

  // Auto-scroll to bottom on initial load or new messages at bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (isInitialLoadRef.current && messages.length > 0) {
      // Initial load: jump to bottom instantly
      el.scrollTop = el.scrollHeight;
      isInitialLoadRef.current = false;
      return;
    }

    // If user is near bottom (within 150px), auto-scroll for new messages
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 150) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  // Preserve scroll position when older messages are prepended
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isInitialLoadRef.current) return;

    if (prevScrollHeightRef.current > 0 && el.scrollHeight > prevScrollHeightRef.current) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      // Only restore if user was near the top (loading older messages)
      if (el.scrollTop < 100) {
        el.scrollTop = diff;
      }
    }
    prevScrollHeightRef.current = el.scrollHeight;
  }, [messages]);

  // Infinite scroll: detect scroll to top
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !onLoadMore || isLoadingMore || hasMore === false) return;

    if (el.scrollTop < 60) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore]);

  useEffect(() => {
    const closeMenus = () => {
      setMenu(null);
      setReactionMenu(null);
    };

    window.addEventListener("resize", closeMenus);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenus();
      }
    });

    return () => {
      window.removeEventListener("resize", closeMenus);
      window.removeEventListener("keydown", closeMenus);
    };
  }, []);

  const closeTransientMenus = () => {
    setMenu(null);
    setReactionMenu(null);
  };

  return (
    <div className="relative" onClick={closeTransientMenus}>
      <div ref={scrollRef} onScroll={handleScroll} className="h-[65vh] overflow-y-auto scroll-smooth rounded-2xl border bg-chat-pattern p-4 space-y-2">
        {/* Loading / end-of-history indicator */}
        {hasMore === false && messages.length > 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No earlier messages</p>
        )}
        {isLoadingMore && (
          <p className="text-xs text-muted-foreground text-center py-2 animate-pulse">Loading earlier messages…</p>
        )}

        {messages.map((message) => {
          const isOwn = message.senderId === currentUserId;

          return (
            <div key={message.id} className={`flex rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${isOwn ? "justify-end" : "justify-start"}`}>
              <div
                className={`group max-w-[70%] rounded-2xl px-4 py-2 shadow-sm transition-transform hover:-translate-y-0.5 ${
                  isOwn ? "bg-[hsl(var(--bubble-out))] rounded-tr-sm" : "bg-[hsl(var(--bubble-in))] border rounded-tl-sm"
                }`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const position = toViewportPosition(event.clientX, event.clientY, CONTEXT_MENU_WIDTH, 164);
                  setReactionMenu(null);
                  setMenu({ messageId: message.id, ...position });
                }}
              >
                <p className={`bubble-name ${isOwn ? "bubble-name-out" : "bubble-name-in"}`} title={format(new Date(message.createdAt), "PPpp")}>
                  {message.senderNickname}
                </p>

                {/* Reply preview */}
                {message.replyToId && message.replyToNickname && (
                  <div className="mb-1.5 rounded-lg border-l-2 border-primary/60 bg-muted/50 px-2.5 py-1.5">
                    <p className="text-[10px] font-semibold text-primary/80">{message.replyToNickname}</p>
                    <p className={`text-xs line-clamp-2 ${isOwn ? "bubble-reply-text-out" : "bubble-reply-text-in"}`}>{message.replyToContent || "..."}</p>
                  </div>
                )}

                {message.deleted ? (
                  <p className={`text-sm italic ${isOwn ? "bubble-meta-out" : "bubble-meta-in"}`}>This message was deleted</p>
                ) : message.messageType === "gif" && message.gifUrl ? (
                  <img src={message.gifUrl} alt="gif" className="max-h-56 w-full rounded-lg object-cover" />
                ) : message.messageType === "image" && message.gifUrl ? (
                  <img
                    src={message.gifUrl}
                    alt="Image"
                    className="max-w-full sm:max-w-xs rounded-lg"
                    loading="lazy"
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                )}

                {message.reactions && message.reactions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 animate-in fade-in duration-200">
                    {message.reactions.map((reaction) => (
                      <span key={`${message.id}-${reaction.reaction}`} className="rounded-full border bg-background/80 px-2 py-0.5 text-xs">
                        {reaction.reaction} {reaction.count}
                      </span>
                    ))}
                  </div>
                )}

                <p className={`text-[10px] mt-1 text-right inline-flex items-center justify-end w-full ${isOwn ? "bubble-meta-out" : "bubble-meta-in"}`} title={format(new Date(message.createdAt), "PPpp")}>
                  <span className="opacity-80 group-hover:opacity-100">{format(new Date(message.createdAt), "HH:mm")}</span>
                  {isOwn && renderStatus(message.status || "sent")}
                </p>
              </div>
            </div>
          );
        })}

        {!messages.length && !isLoadingMore && <p className="text-sm text-muted-foreground text-center mt-20">No messages yet. Start the conversation.</p>}
      </div>

      {menu && contextMessage && (
        <div
          className="fixed z-50 w-44 rounded-lg border bg-card shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:text-muted-foreground"
            disabled={contextMessage.deleted}
            onClick={() => {
              const position = toViewportPosition(menu.x, menu.y + 36, REACTION_MENU_WIDTH, 56);
              setReactionMenu({ messageId: contextMessage.id, ...position });
              setMenu(null);
            }}
          >
            React
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:text-muted-foreground"
            disabled={contextMessage.deleted}
            onClick={() => {
              onReply?.(contextMessage);
              setMenu(null);
            }}
          >
            Reply
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              onDelete?.(contextMessage.id, "me");
              setMenu(null);
            }}
          >
            Delete for me
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:text-muted-foreground"
            disabled={contextMessage.senderId !== currentUserId || contextMessage.deleted}
            onClick={() => {
              onDelete?.(contextMessage.id, "everyone");
              setMenu(null);
            }}
          >
            Delete for everyone
          </button>
        </div>
      )}

      {reactionMenu && (
        <div
          className="fixed z-50 rounded-full border bg-card px-2 py-1 shadow-lg"
          style={{ left: reactionMenu.x, top: reactionMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex gap-1">
            {reactionOptions.map((reaction) => (
              <button
                key={reaction}
                type="button"
                className="rounded-full px-2 py-1 text-lg hover:bg-muted"
                onClick={() => {
                  onReact?.(reactionMenu.messageId, reaction);
                  setReactionMenu(null);
                }}
              >
                {reaction}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
