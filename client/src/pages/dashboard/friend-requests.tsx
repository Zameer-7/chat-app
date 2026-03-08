import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFriendRequests, getOutgoingFriendRequests, respondToFriendRequest } from "@/services/chat-api";
import { Button } from "@/components/ui/button";

export default function FriendRequestsPage() {
  const queryClient = useQueryClient();
  const { data: requests = [] } = useQuery({ queryKey: ["friend-requests"], queryFn: getFriendRequests });
  const { data: outgoing = [] } = useQuery({ queryKey: ["outgoing-friend-requests"], queryFn: getOutgoingFriendRequests });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "accepted" | "rejected" }) => respondToFriendRequest(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["outgoing-friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Friend Requests</h2>

      {/* Incoming Requests */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Incoming</h3>
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          {requests.map((request) => {
            const busy = mutation.isPending && mutation.variables?.id === request.id;
            return (
              <div key={request.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                <div className="flex items-center gap-3">
                  {request.senderAvatarUrl ? (
                    <img src={request.senderAvatarUrl} className="h-10 w-10 rounded-full object-cover" alt={request.senderNickname} />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-400 to-teal-500 text-white grid place-items-center text-sm font-bold">
                      {(request.senderNickname?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{request.senderNickname}</p>
                    <p className="text-xs text-muted-foreground">@{request.senderUsername}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => mutation.mutate({ id: request.id, status: "accepted" })}>Accept</Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => mutation.mutate({ id: request.id, status: "rejected" })}>Reject</Button>
                </div>
              </div>
            );
          })}
          {!requests.length && <p className="text-sm text-muted-foreground">No incoming requests.</p>}
        </div>
      </div>

      {/* Outgoing Requests */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Outgoing</h3>
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          {outgoing.map((request) => (
            <div key={request.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
              <div className="flex items-center gap-3">
                {request.receiverAvatarUrl ? (
                  <img src={request.receiverAvatarUrl} className="h-10 w-10 rounded-full object-cover" alt={request.receiverNickname} />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 text-white grid place-items-center text-sm font-bold">
                    {(request.receiverNickname?.[0] || "U").toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium">{request.receiverNickname}</p>
                  <p className="text-xs text-muted-foreground">@{request.receiverUsername}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-2.5 py-1">
                Pending
              </span>
            </div>
          ))}
          {!outgoing.length && <p className="text-sm text-muted-foreground">No outgoing requests.</p>}
        </div>
      </div>
    </div>
  );
}
