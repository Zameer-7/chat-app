import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovaLogo } from "@/components/layout/nova-logo";
import { checkUsernameAvailability, getCaptcha } from "@/services/api";
import { RefreshCw } from "lucide-react";

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
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer("");
    try {
      const data = await getCaptcha();
      setCaptchaId(data.id);
      setCaptchaImage(data.image);
    } catch {
      setError("Failed to load CAPTCHA. Please refresh the page.");
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

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

    if (!captchaAnswer.trim()) {
      setError("Please type the CAPTCHA word shown above.");
      return;
    }

    setLoading(true);
    try {
      const returnedEmail = await signup(username, email, password, captchaId, captchaAnswer.trim());
      if (returnedEmail) {
        // OTP verification required
        setLocation(`/verify-email?email=${encodeURIComponent(returnedEmail)}`);
      } else {
        // Auto-verified, go straight to dashboard
        setLocation("/dashboard");
      }
    } catch (err) {
      const message = (err as Error).message;
      // Reset captcha on failure so user must re-verify
      fetchCaptcha();
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
          <div className="space-y-1">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
              <span className={password.length >= 8 ? "text-green-600" : "text-muted-foreground"}>8+ chars</span>
              <span className={/[A-Z]/.test(password) ? "text-green-600" : "text-muted-foreground"}>Uppercase</span>
              <span className={/[0-9]/.test(password) ? "text-green-600" : "text-muted-foreground"}>Number</span>
              <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? "text-green-600" : "text-muted-foreground"}>Special char</span>
            </div>
          </div>

          {/* CAPTCHA */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">Type the text below to verify you're human</p>
            <div className="flex items-center justify-center gap-2">
              {captchaLoading ? (
                <div className="flex h-[70px] w-[200px] items-center justify-center rounded-lg border bg-muted">
                  <span className="text-sm text-muted-foreground">Loading…</span>
                </div>
              ) : (
                <img
                  src={captchaImage}
                  alt="CAPTCHA"
                  className="h-[70px] w-[200px] rounded-lg border select-none pointer-events-none"
                  draggable={false}
                />
              )}
              <button
                type="button"
                onClick={fetchCaptcha}
                disabled={captchaLoading}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Refresh CAPTCHA"
              >
                <RefreshCw className={`h-4 w-4 ${captchaLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <Input
              placeholder="Type the text shown above"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              autoComplete="off"
              className="text-center"
            />
          </div>

          <Button
            className="w-full rounded-xl"
            disabled={loading || availability === "taken" || !captchaAnswer.trim()}
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

      {/* Footer */}
      <footer className="mt-6 text-center text-xs text-gray-500 space-y-1 pb-4">
        <p>© {new Date().getFullYear()} Vibely — Real-time chat, made simple.</p>
        <div className="flex items-center justify-center gap-3">
          <span className="hover:text-gray-700 cursor-default">Privacy Policy</span>
          <span>·</span>
          <span className="hover:text-gray-700 cursor-default">Terms of Service</span>
          <span>·</span>
          <span className="hover:text-gray-700 cursor-default">Contact</span>
        </div>
      </footer>
    </div>
  );
}

