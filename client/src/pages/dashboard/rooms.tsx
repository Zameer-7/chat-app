import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { createRoom, getJoinedRooms } from "@/services/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function RoomsPage() {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomName, setRoomName] = useState("");
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: allRooms = [] } = useQuery({ queryKey: ["joined-rooms"], queryFn: getJoinedRooms });
  const activeRooms = allRooms.filter((r) => !r.leftAt);
  const leftRooms = allRooms.filter((r) => r.leftAt);

  const createMutation = useMutation({
    mutationFn: () => createRoom(roomName.trim() || undefined),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["joined-rooms"] });
      setRoomName("");
      setLocation(`/rooms/${room.id}`);
    },
    onError: () => toast({ title: "Failed to create room", variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-2xl font-black">Rooms</h2>

      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Create Room</h3>
        <Input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Room name (optional, e.g. Project Chat)"
          maxLength={50}
          onKeyDown={(e) => { if (e.key === "Enter") createMutation.mutate(); }}
        />
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating…" : "Create New Room"}
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Join Room by ID</h3>
        <Input
          value={roomIdInput}
          onChange={(e) => setRoomIdInput(e.target.value)}
          placeholder="Enter room ID"
          onKeyDown={(e) => { if (e.key === "Enter" && roomIdInput.trim()) setLocation(`/rooms/${roomIdInput.trim()}`); }}
        />
        <Button
          disabled={!roomIdInput.trim()}
          onClick={() => setLocation(`/rooms/${roomIdInput.trim()}`)}
        >
          Join Room
        </Button>
      </div>

      {activeRooms.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <h3 className="font-semibold">Active Rooms</h3>
          <div className="space-y-2">
            {activeRooms.map((r) => (
              <Link key={r.roomId} href={`/rooms/${r.roomId}`}>
                <a className="flex items-center justify-between rounded-xl border px-3 py-2.5 hover:bg-muted transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{r.roomName || r.roomId}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.roomId}</p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-3 shrink-0">Open →</span>
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}

      {leftRooms.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-muted-foreground">Left Rooms</h3>
          <div className="space-y-2">
            {leftRooms.map((r) => (
              <Link key={r.roomId} href={`/rooms/${r.roomId}`}>
                <a className="flex items-center justify-between rounded-xl border px-3 py-2.5 hover:bg-muted transition-colors opacity-60">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{r.roomName || r.roomId}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.roomId}</p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-3 shrink-0">Rejoin →</span>
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}

      {allRooms.length === 0 && (
        <p className="text-sm text-muted-foreground">You haven't joined any rooms yet. Create one above!</p>
      )}
    </div>
  );
}

