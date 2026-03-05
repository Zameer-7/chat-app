import { useState, useRef, useEffect } from "react";
import { Send, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [content, setContent] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    
    onSend(trimmed);
    setContent("");
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div className="bg-card border-t p-3 md:p-4 pb-safe">
      <form 
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto flex items-end gap-2 bg-background border rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all"
      >
        <button 
          type="button" 
          className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <Smile className="w-6 h-6" />
        </button>

        <textarea
          ref={inputRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-0 focus:ring-0 resize-none py-2 px-1 text-foreground placeholder:text-muted-foreground custom-scrollbar"
          style={{ scrollbarWidth: 'thin' }}
        />

        <Button 
          type="submit" 
          size="icon"
          disabled={!content.trim() || disabled}
          className="rounded-xl h-10 w-10 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all active:scale-95"
        >
          <Send className="w-5 h-5 ml-0.5" />
        </Button>
      </form>
    </div>
  );
}
