import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getMyProfile, updateMyProfile } from "@/services/profile-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [bio, setBio] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile-me"],
    queryFn: getMyProfile,
  });

  useEffect(() => {
    if (profile) {
      setBio(profile.bio || "");
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      toast({ title: "Profile updated successfully." });
    },
    onError: (err) => {
      toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  const handleAvatarFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      mutation.mutate({ avatarUrl: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  if (!profile) {
    return <div className="max-w-lg mx-auto rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 p-6 shadow-md">Loading profile...</div>;
  }

  return (
    <div className="max-w-lg mx-auto rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 p-6 shadow-md space-y-5">
      <h2 className="text-2xl font-black">Profile</h2>

      <div className="flex flex-col items-center gap-3">
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="Avatar" className="h-24 w-24 rounded-full object-cover border" />
        ) : (
          <div className="h-24 w-24 rounded-full bg-gradient-to-r from-green-400 to-teal-500 text-white grid place-items-center text-3xl font-bold">
            {initials(profile.nickname)}
          </div>
        )}

        <label className="text-sm text-primary underline cursor-pointer">
          Upload picture
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarFile(file);
            }}
          />
        </label>

        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${profile.isOnline ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
          <span className={`h-2 w-2 rounded-full ${profile.isOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
          {profile.isOnline ? "Online" : `Last seen ${format(new Date(profile.lastSeen), "dd MMM yyyy, HH:mm")}`}
        </span>
      </div>

      <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Nickname:</span> {profile.nickname}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Username:</span> {profile.username}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Email:</span> {profile.email}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">User ID:</span> {profile.id}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Member Since:</span> {format(new Date(profile.createdAt), "MMM yyyy")}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Last username change:</span> {profile.usernameLastChanged ? format(new Date(profile.usernameLastChanged), "dd MMM yyyy") : "Never"}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Last nickname change:</span> {profile.nicknameLastChanged ? format(new Date(profile.nicknameLastChanged), "dd MMM yyyy") : "Never"}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Friends:</span> {profile.friendCount}</p>
        <p><span className="font-semibold text-gray-900 dark:text-gray-100">Rooms joined:</span> {profile.roomCount}</p>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="Add a short bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
        />
        <Button onClick={() => mutation.mutate({ bio })} disabled={mutation.isPending}>Save Bio</Button>
      </div>

      <Button variant="secondary" onClick={() => setLocation("/settings")}>Edit Profile</Button>
    </div>
  );
}
