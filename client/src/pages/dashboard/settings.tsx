import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getSettingsProfile, updateSettingsProfile, updateSettingsTheme, type ChatTheme } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const themes: ChatTheme[] = ["light", "dark", "ocean", "midnight", "love"];

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();

  const { data: profile } = useQuery({ queryKey: ["settings-profile"], queryFn: getSettingsProfile, enabled: Boolean(user) });

  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [theme, setTheme] = useState<ChatTheme>("light");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setNickname(profile.nickname);
    setUsername(profile.username);
    setTheme(profile.chatTheme);
  }, [profile]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await updateSettingsProfile({ nickname, username });
      setUser(updated);
      toast({ title: "Profile updated successfully." });
    } catch (error) {
      toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveTheme = async () => {
    setSavingTheme(true);
    try {
      const updated = await updateSettingsTheme(theme);
      setUser(updated);
      toast({ title: "Theme updated" });
    } catch (error) {
      toast({ title: "Theme update failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingTheme(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-black">Settings</h2>

      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <h3 className="text-lg font-bold">Profile Settings</h3>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Nickname</label>
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={2} maxLength={25} />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Username</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={20} />
        </div>
        <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save Changes"}</Button>
      </section>

      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <h3 className="text-lg font-bold">Chat Theme</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {themes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTheme(item)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${theme === item ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <Button onClick={saveTheme} disabled={savingTheme}>{savingTheme ? "Applying..." : "Apply Theme"}</Button>
      </section>
    </div>
  );
}
