import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useCreateRoom() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.rooms.create.path, {
        method: api.rooms.create.method,
        headers: { "Content-Type": "application/json" },
        // Sending empty object or specific ID if needed, schema allows optional
        body: JSON.stringify({}), 
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const err = api.rooms.create.responses[400].parse(await res.json());
          throw new Error(err.message);
        }
        throw new Error("Failed to create room");
      }
      return api.rooms.create.responses[201].parse(await res.json());
    },
  });
}

export function useRoom(id: string) {
  return useQuery({
    queryKey: [api.rooms.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.rooms.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      
      if (res.status === 404) return null; // Let the component handle 404 redirect
      if (!res.ok) throw new Error("Failed to fetch room");
      
      return api.rooms.get.responses[200].parse(await res.json());
    },
    retry: false, // Don't retry on 404s
  });
}

export function useRoomMessages(roomId: string) {
  return useQuery({
    queryKey: [api.rooms.messages.list.path, roomId],
    queryFn: async () => {
      const url = buildUrl(api.rooms.messages.list.path, { id: roomId });
      const res = await fetch(url, { credentials: "include" });
      
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to fetch messages");
      }
      
      return api.rooms.messages.list.responses[200].parse(await res.json());
    },
  });
}
