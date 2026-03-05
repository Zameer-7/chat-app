import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { MessageSquare, ArrowRight, Plus, Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCreateRoom } from "@/hooks/use-rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const [, setLocation] = useLocation();
  const { username, setUsername, isLoaded } = useAuth();
  
  const [localName, setLocalName] = useState("");
  const [roomIdToJoin, setRoomIdToJoin] = useState("");
  
  const createRoom = useCreateRoom();

  useEffect(() => {
    if (username) setLocalName(username);
  }, [username]);

  const handleCreateRoom = async () => {
    if (!localName.trim()) return;
    setUsername(localName.trim());
    
    try {
      const room = await createRoom.mutateAsync();
      setLocation(`/chat/${room.id}`);
    } catch (err) {
      console.error(err);
      // In a real app, toast notification here
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localName.trim() || !roomIdToJoin.trim()) return;
    setUsername(localName.trim());
    setLocation(`/chat/${roomIdToJoin.trim()}`);
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 w-full h-[40vh] bg-primary/10 rounded-b-[100%] blur-3xl -z-10" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground mb-4 shadow-lg shadow-primary/25">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
            ChatSpace
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Connect instantly in real-time rooms.
          </p>
        </div>

        <div className="bg-card border shadow-xl shadow-black/5 rounded-3xl p-6 md:p-8 relative z-10 overflow-hidden">
          <div className="space-y-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground font-semibold">Your Display Name</Label>
              <Input 
                id="username"
                placeholder="E.g. Alex, CodeNinja..." 
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                className="bg-background h-12 text-lg px-4 rounded-xl border-border focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-secondary p-1 rounded-xl">
              <TabsTrigger value="create" className="rounded-lg font-medium data-[state=active]:shadow-sm">
                New Room
              </TabsTrigger>
              <TabsTrigger value="join" className="rounded-lg font-medium data-[state=active]:shadow-sm">
                Join Room
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 mb-4">
                <p className="text-sm text-muted-foreground text-center">
                  Generate a secure, random room ID and instantly start chatting.
                </p>
              </div>
              <Button 
                onClick={handleCreateRoom}
                disabled={!localName.trim() || createRoom.isPending}
                className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl transition-all rounded-xl"
              >
                {createRoom.isPending ? (
                  "Creating..."
                ) : (
                  <>
                    <Plus className="w-5 h-5 mr-2" />
                    Create New Room
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="join" className="animate-in fade-in slide-in-from-bottom-2">
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roomId" className="sr-only">Room ID</Label>
                  <div className="relative">
                    <Hash className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input 
                      id="roomId"
                      placeholder="Paste Room ID here..." 
                      value={roomIdToJoin}
                      onChange={(e) => setRoomIdToJoin(e.target.value)}
                      className="pl-11 bg-background h-12 text-base rounded-xl"
                    />
                  </div>
                </div>
                <Button 
                  type="submit"
                  disabled={!localName.trim() || !roomIdToJoin.trim()}
                  variant="secondary"
                  className="w-full h-12 text-base font-semibold rounded-xl border border-border/50 hover:bg-secondary/80"
                >
                  Join Room
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </div>
  );
}
