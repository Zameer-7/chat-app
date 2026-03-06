import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovaLogo } from "@/components/layout/nova-logo";
import { checkUsernameAvailability } from "@/services/api";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const DEBOUNCE_MS = 500;

export default function SignupPage() {
  const { signup } = useAuth();
  const [, setLocation] = useLocation();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<"available" | "taken" | "checking" | null>(null);
  const [loading, setLoading] = useState(false);

  // Live availability check with debounce
  useEffect(() => {
    setUsernameError(null);
    setAvailability(null);

    if (!username) return;

    if (!USERNAME_REGEX.test(username)) {
      setUsernameError(
        "Username must be 3\u201320 characters and contain only letters, numbers, or underscores.",
      );
      return;
    }

    setAvailability("checking");
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(username);
        setAvailability(result.available ? "available" : "taken");
        if (!result.available) {
          setUsernameError("Username already taken. Try a different one.");
        }
      } catch {
        setAvailability(null);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [username]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!USERNAME_REGEX.test(username)) {
      setUsernameError(
        "Username must be 3\u201320 characters and contain only letters, numbers, or underscores.",
      );
      return;
    }

    if (availability === "taken") {
      setUsernameError("Username already taken. Try a different one.");
      return;
    }

    setLoading(true);
    try {
      await signup(username, email, password);
      setLocation("/dashboard");
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("username")) {
        setUsernameError("Username already taken. Try a different one.");
        setAvailability("taken");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  const usernameInvalid = !!usernameError || availability === "taken";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e7ece7] px-4 py-8">
      <div className="pointer-events-none absolute -left-24 top-4 h-72 w-72 rounded-full bg-teal-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <form
          onSubmit={onSubmit}
          className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur"
        >
          <NovaLogo />
          <div>
            <h1 className="text-2xl font-black">Create account</h1>
            <p className="text-sm text-muted-foreground">Join Vibely in seconds</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Username */}
          <div className="space-y-1">
            <div className="relative">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className={
                  usernameInvalid
                    ? "border-destructive pr-24 focus-visible:ring-destructive"
                    : availability === "available"
                      ? "border-green-500 pr-24 focus-visible:ring-green-500"
                      : "pr-24"
                }
              />
              {availability === "checking" && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  Checking…
                </span>
              )}
              {availability === "available" && !usernameError && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-green-600">
                  ✔ Available
                </span>
              )}
              {(availability === "taken" || (usernameError && availability !== "checking")) && availability !== "available" && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-destructive">
                  ✖ Taken
                </span>
              )}
            </div>
            {usernameError && (
              <p className="text-xs text-destructive">{usernameError}</p>
            )}
          </div>

          {/* Email */}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {/* Password */}
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <Button
            className="w-full rounded-xl"
            disabled={loading || availability === "taken"}
          >
            {loading ? "Creating account…" : "Create Account"}
          </Button>

          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login">
              <a className="font-semibold underline">Login</a>
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

