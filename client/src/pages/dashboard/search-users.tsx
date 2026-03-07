import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { searchUsers, sendFriendRequest, getOutgoingFriendRequests, getFriends } from "@/services/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function SearchUsersPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: users = [], isFetching } = useQuery({
    queryKey: ["search-users", debouncedQ],
    queryFn: () => searchUsers(debouncedQ),
    enabled: debouncedQ.trim().length >= 1,
    staleTime: 10_000,
  });

  // Load outgoing pending requests to show correct status
  const { data: outgoingRequests = [] } = useQuery({
    queryKey: ["outgoing-friend-requests"],
    queryFn: getOutgoingFriendRequests,
  });
  const pendingReceiverIds = new Set(outgoingRequests.map((r) => r.receiverId));

  // Load current friends to show "Already Friends"
  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getFriends,
  });
  const friendIds = new Set(friends.map((f) => f.id));

  const handleInput = (value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(value.trim()), 300);
  };

  const mutation = useMutation({
    mutationFn: (receiverId: number) => sendFriendRequest(receiverId),
    onSuccess: () => {
      toast({ title: "Friend request sent!" });
    },
    onError: (err, receiverId) => {
      setSent((prev) => ({ ...prev, [receiverId]: false }));
      toast({ title: "Request failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black">Search Users</h2>
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Start typing a username…"
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Live suggestions */}
        {isFetching && q.trim() && (
          <p className="text-xs text-muted-foreground animate-pulse">Searching…</p>
        )}

        <div className="space-y-2">
          {users.map((user) => {
            const requested = sent[user.id] || pendingReceiverIds.has(user.id);
            const alreadyFriend = friendIds.has(user.id);
            return (
              <div key={user.id} className="flex items-center justify-between rounded-xl border px-3 py-2 hover:bg-muted/50 transition-colors">
                <button
                  type="button"
                  className="flex items-center gap-3 min-w-0 text-left"
                  onClick={() => setLocation(`/dm/${user.id}`)}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} className="h-10 w-10 rounded-full object-cover shrink-0" alt={user.nickname} />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-400 to-teal-500 text-white grid place-items-center text-sm font-bold shrink-0">
                      {(user.nickname?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{user.nickname}</p>
                    <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                  </div>
                </button>
                {alreadyFriend ? (
                  <Button size="sm" variant="secondary" disabled>
                    Friends ✓
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={requested ? "outline" : "default"}
                    disabled={requested || mutation.isPending}
                    onClick={() => {
                      setSent((prev) => ({ ...prev, [user.id]: true }));
                      mutation.mutate(user.id);
                    }}
                  >
                    {requested ? "Pending Request" : "Add Friend"}
                  </Button>
                )}
              </div>
            );
          })}
          {!isFetching && !users.length && debouncedQ.trim().length >= 1 && (
            <p className="text-sm text-muted-foreground">No users found for "{debouncedQ}"</p>
          )}
          {!q.trim() && (
            <p className="text-sm text-muted-foreground">Type a username above to see suggestions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
