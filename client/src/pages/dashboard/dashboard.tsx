import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { createRoom, getFriends } from "@/services/chat-api";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { data: friends = [], refetch } = useQuery({ queryKey: ["friends"], queryFn: getFriends });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Dashboard</h2>

      <section className="rounded-2xl border bg-card p-4">
        <h3 className="font-semibold mb-3">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              const room = await createRoom();
              window.location.href = `/rooms/${room.id}`;
            }}
          >
            Create Room
          </Button>
          <Link href="/rooms"><a className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium">Join Room</a></Link>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Friends</h3>
          <Button variant="secondary" onClick={() => refetch()}>Refresh</Button>
        </div>
        <div className="space-y-2">
          {friends.map((friend) => (
            <div key={friend.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
              <div>
                <p className="font-medium">{friend.nickname}</p>
                <p className="text-xs text-muted-foreground">{friend.isOnline ? "Online" : "Offline"}</p>
              </div>
              <Link href={`/dm/${friend.id}`}><a className="text-sm underline">Open Chat</a></Link>
            </div>
          ))}
          {!friends.length && <p className="text-sm text-muted-foreground">No friends yet.</p>}
        </div>
      </section>
    </div>
  );
}
