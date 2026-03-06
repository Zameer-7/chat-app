import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ChatMessage } from "@/services/chat-api";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showAvatar?: boolean;
  isOnline?: boolean;
}

export function ChatBubble({ message, isOwn, showAvatar = true, isOnline }: ChatBubbleProps) {
  const date = message.createdAt ? new Date(message.createdAt) : new Date();

  return (
    <div className={cn("flex w-full mt-2", isOwn ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[80%] md:max-w-[70%] flex-col gap-1", isOwn ? "items-end" : "items-start")}>
        {showAvatar && !isOwn && (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-xs font-semibold text-muted-foreground">{message.senderNickname}</span>
            {isOnline !== undefined && (
              <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-green-500" : "bg-gray-400")} />
            )}
          </div>
        )}

        <div
          className={cn(
            "relative px-4 py-2.5 shadow-sm",
            isOwn
              ? "bg-[hsl(var(--bubble-out))] text-foreground rounded-2xl rounded-tr-sm"
              : "bg-[hsl(var(--bubble-in))] text-foreground rounded-2xl rounded-tl-sm border border-border/50",
          )}
        >
          <p className="text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
          <div className={cn("flex items-center justify-end gap-1 mt-1 -mb-1", "text-muted-foreground")}>
            <span className="text-[10px] uppercase font-medium tracking-wider opacity-60">{format(date, "HH:mm")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
