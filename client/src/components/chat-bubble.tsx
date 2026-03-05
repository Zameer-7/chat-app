import { format } from "date-fns";
import { motion } from "framer-motion";
import { type MessageResponse } from "@shared/routes";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatBubbleProps {
  message: MessageResponse;
  isOwn: boolean;
  showAvatar?: boolean;
}

export function ChatBubble({ message, isOwn, showAvatar = true }: ChatBubbleProps) {
  // Safe date parsing for JSON strings
  const date = message.createdAt ? new Date(message.createdAt) : new Date();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex w-full mt-2",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex max-w-[80%] md:max-w-[70%] flex-col gap-1",
        isOwn ? "items-end" : "items-start"
      )}>
        {showAvatar && !isOwn && (
          <span className="text-xs font-semibold text-muted-foreground ml-1">
            {message.username}
          </span>
        )}
        
        <div className={cn(
          "relative px-4 py-2.5 shadow-sm",
          isOwn 
            ? "bg-[hsl(var(--bubble-out))] text-foreground rounded-2xl rounded-tr-sm" 
            : "bg-[hsl(var(--bubble-in))] text-foreground rounded-2xl rounded-tl-sm border border-border/50"
        )}>
          <p className="text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </p>
          
          <div className={cn(
            "flex items-center justify-end gap-1 mt-1 -mb-1",
            isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            <span className="text-[10px] uppercase font-medium tracking-wider opacity-60">
              {format(date, "HH:mm")}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
