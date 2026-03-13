import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getMyProfile, updateMyProfile, uploadAvatar } from "@/services/profile-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Hash, CalendarDays, MoreVertical, Trash2, Upload } from "lucide-react";
import { deleteAvatar } from "@/services/profile-api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BIO_MAX = 150;
const FALLBACK_POLL_MS = 30_000;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const [bio, setBio] = useState("");
  const [bioEditing, setBioEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile-me"],
    queryFn: getMyProfile,
    refetchInterval: FALLBACK_POLL_MS,
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
      setAvatarPreview(null);
      setBioEditing(false);
      toast({ title: "Profile updated" });
    },
    onError: (err) => {
      toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      setAvatarPreview(null);
      toast({ title: "Profile picture removed" });
    },
    onError: (err) => {
      toast({ title: "Failed to remove picture", description: (err as Error).message, variant: "destructive" });
    },
  });

  const handleAvatarFile = useCallback(async (file: File) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Only JPG, JPEG, PNG, and WebP are allowed", variant: "destructive" });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast({ title: "Image must be smaller than 5 MB", variant: "destructive" });
      return;
    }

    try {
      const { avatarPath } = await uploadAvatar(file);
      setAvatarPreview(avatarPath);
      mutation.mutate({ avatarPath });
    } catch (err) {
      toast({ title: "Failed to upload image", description: (err as Error).message, variant: "destructive" });
    }
  }, [mutation, toast]);

  if (!profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const displayAvatar = avatarPreview || profile.avatarUrl;

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-6">
      {/* Profile Card */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
        {/* Banner gradient */}
        <div className="h-24 bg-gradient-to-r from-teal-400 via-emerald-400 to-green-500" />

        {/* Avatar + Name */}
        <div className="flex flex-col items-center -mt-14 pb-6 px-6">
          <div className="relative group">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt="Avatar"
                className="h-28 w-28 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-md"
              />
            ) : (
              <div className="h-28 w-28 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-white grid place-items-center text-4xl font-bold border-4 border-white dark:border-gray-800 shadow-md select-none">
                {initials(profile.nickname || profile.username)}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-white dark:bg-gray-700 shadow-md border border-gray-200 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Profile picture options"
                >
                  <MoreVertical className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" sideOffset={8}>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload new picture
                </DropdownMenuItem>
                {displayAvatar && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete profile picture
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <h2 className="mt-3 text-xl font-black text-gray-900 dark:text-gray-50">
            {profile.nickname}
          </h2>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
      </div>

      {/* Bio Section */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-md p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">About</h3>
          {!bioEditing && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setBioEditing(true)}
            >
              Edit
            </button>
          )}
        </div>

        {bioEditing ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Tell people about yourself..."
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
              rows={3}
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{bio.length}/{BIO_MAX}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setBio(profile.bio || "");
                    setBioEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => mutation.mutate({ bio })}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {profile.bio || <span className="italic text-muted-foreground">No bio yet</span>}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-md p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-3">Info</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-bold leading-none text-gray-900 dark:text-gray-50">{profile.friendCount}</p>
              <p className="text-xs text-muted-foreground">Friends</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Hash className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-lg font-bold leading-none text-gray-900 dark:text-gray-50">{profile.roomCount}</p>
              <p className="text-xs text-muted-foreground">Rooms Joined</p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
              {format(new Date(profile.createdAt), "MMMM yyyy")}
            </p>
            <p className="text-xs text-muted-foreground">Member since</p>
          </div>
        </div>
      </div>
    </div>
  );
}
