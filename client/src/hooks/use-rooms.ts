import { useMutation, useQuery } from "@tanstack/react-query";
import { createRoom, getRoom, getRoomMessages } from "@/services/chat-api";

export function useCreateRoom() {
  return useMutation({ mutationFn: createRoom });
}

export function useRoom(id: string) {
  return useQuery({ queryKey: ["room", id], queryFn: () => getRoom(id), enabled: Boolean(id) });
}

export function useRoomMessages(id: string) {
  return useQuery({ queryKey: ["room-messages", id], queryFn: () => getRoomMessages(id), enabled: Boolean(id) });
}
