import { useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Users, Loader2, AlertCircle, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useRoom, useRoomMessages } from "@/hooks/use-rooms";
import { useChatWebSocket } from "@/hooks/use-chat-ws";
import { ChatBubble } from "@/components/chat-bubble";
import { ChatInput } from "@/components/chat-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Chat() {
  const [, params] = useRoute("/chat/:id");
  const roomId = params?.id || "";
  const [, setLocation] = useLocation();
  const { username, isLoaded } = useAuth();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Queries
  const { data: room, isLoading: isLoadingRoom, error: roomError } = useRoom(roomId);
  const { data: messages = [], isLoading: isLoadingMessages } = useRoomMessages(roomId);
  
  // WebSocket
  const { status: wsStatus, sendMessage } = useChatWebSocket(roomId, username);

  // Redirect if no username
  useEffect(() => {
    if (isLoaded && !username) {
      setLocation("/");
    }
  }, [username, isLoaded, setLocation]);

  // Redirect if room not found (404 returns null from our hook)
  useEffect(() => {
    if (room === null) {
      setLocation("/");
    }
  }, [room, setLocation]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isLoaded || !username) return null;

  if (isLoadingRoom) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (roomError) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-4">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Could not connect to room</h2>
        <Button onClick={() => setLocation("/")}>Return Home</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-4 py-3 bg-card border-b z-10 shadow-sm relative">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-secondary -ml-2"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <div className="flex flex-col cursor-pointer group" onClick={copyRoomId}>
            <h2 className="text-foreground font-bold tracking-tight text-lg flex items-center gap-2">
              Room Chat
              {copied ? (
                <CheckCircle2 className="w-4 h-4 text-primary animate-in zoom-in" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate max-w-[120px] md:max-w-[200px]">{roomId}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${
                  wsStatus === "connected" ? "bg-primary" : 
                  wsStatus === "connecting" ? "bg-accent animate-pulse" : "bg-destructive"
                }`} />
                <span className="capitalize">{wsStatus}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium bg-secondary/50 px-3 py-1.5 rounded-full border">
          <Users className="w-4 h-4 text-primary" />
          <span>{username}</span>
        </div>
      </header>

      {/* Messages Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-chat-pattern p-4 md:p-6 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto flex flex-col justify-end min-h-full pb-2">
          {/* Top disclaimer/info */}
          <div className="flex justify-center mb-8">
            <div className="bg-background/80 backdrop-blur-sm text-muted-foreground text-xs px-4 py-2 rounded-lg shadow-sm border border-border/50 text-center max-w-sm">
              Messages are end-to-end encrypted. No one outside of this chat, not even ChatSpace, can read or listen to them.
            </div>
          </div>

          {isLoadingMessages ? (
            <div className="space-y-4 w-full">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <Skeleton className="h-16 w-48 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, idx) => {
                // Determine if we should show the avatar/name (only if previous message wasn't from same user)
                const showAvatar = idx === 0 || messages[idx - 1].username !== msg.username;
                const isOwn = msg.username === username;
                
                return (
                  <ChatBubble 
                    key={msg.id || idx} 
                    message={msg} 
                    isOwn={isOwn} 
                    showAvatar={showAvatar}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <ChatInput 
        onSend={sendMessage} 
        disabled={wsStatus !== "connected"} 
      />
    </div>
  );
}
