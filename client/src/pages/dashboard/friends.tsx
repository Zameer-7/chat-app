import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getFriends } from "@/services/chat-api";

export default function FriendsPage() {
  const { data: friends = [] } = useQuery({ queryKey: ["friends"], queryFn: getFriends });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black">Friends</h2>
      <div className="rounded-2xl border bg-card p-4 space-y-2">
        {friends.map((friend) => (
          <div key={friend.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
            <div>
              <p className="font-medium">{friend.nickname}</p>
              <p className="text-xs text-muted-foreground">{friend.isOnline ? "Online" : "Offline"}</p>
            </div>
            <Link href={`/dm/${friend.id}`}><a className="text-sm underline">Message</a></Link>
          </div>
        ))}
        {!friends.length && <p className="text-sm text-muted-foreground">No accepted friends yet.</p>}
      </div>
    </div>
  );
}
