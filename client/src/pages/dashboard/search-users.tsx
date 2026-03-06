import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { searchUsers, sendFriendRequest } from "@/services/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function SearchUsersPage() {
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  const { data: users = [], refetch, isFetching } = useQuery({
    queryKey: ["search-users", q],
    queryFn: () => searchUsers(q),
    enabled: false,
  });

  const mutation = useMutation({
    mutationFn: (receiverId: number) => sendFriendRequest(receiverId),
    onError: (err, receiverId) => {
      setSent((prev) => ({ ...prev, [receiverId]: false }));
      toast({ title: "Request failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black">Search Users</h2>
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users by username" />
          <Button onClick={() => refetch()} disabled={!q.trim() || isFetching}>Search</Button>
        </div>

        <div className="space-y-2">
          {users.map((user) => {
            const requested = sent[user.id];
            return (
              <div key={user.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} className="h-10 w-10 rounded-full object-cover" alt={user.nickname} />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-400 to-teal-500 text-white grid place-items-center text-sm font-bold">
                      {(user.nickname?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{user.nickname}</p>
                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={requested || mutation.isPending}
                  onClick={() => {
                    setSent((prev) => ({ ...prev, [user.id]: true }));
                    mutation.mutate(user.id);
                  }}
                >
                  {requested ? "Request Sent" : "Add Friend"}
                </Button>
              </div>
            );
          })}
          {!users.length && q && <p className="text-sm text-muted-foreground">No users found.</p>}
        </div>
      </div>
    </div>
  );
}
