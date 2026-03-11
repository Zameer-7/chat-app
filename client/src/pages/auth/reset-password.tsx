import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { resetPassword } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovaLogo } from "@/components/layout/nova-logo";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const email = params.get("email") || "";
  const code = params.get("code") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if missing params
  if (!email || !code) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#e7ece7] px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
          <div className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur text-center">
            <NovaLogo />
            <p className="text-sm text-destructive">Invalid reset link. Please start again.</p>
            <Button className="w-full rounded-xl" onClick={() => setLocation("/forgot-password")}>
              Go to Forgot Password
            </Button>
          </div>
        </div>
      </div>
    );
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      setError("Password must contain at least one special character");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, code, newPassword);
      setSuccess(true);
      setTimeout(() => setLocation("/login"), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e7ece7] px-4 py-8">
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <form onSubmit={handleReset} className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur">
          <NovaLogo />
          <div>
            <h1 className="text-2xl font-black">Reset Password</h1>
            <p className="text-sm text-muted-foreground">Choose a new password for your account</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
              <p className="text-sm font-medium text-green-700">Password updated successfully!</p>
              <p className="text-xs text-green-600 mt-1">Redirecting to login...</p>
            </div>
          )}
          {!success && (
            <>
              <div className="space-y-1">
                <Input
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  <span className={newPassword.length >= 8 ? "text-green-600" : "text-muted-foreground"}>8+ chars</span>
                  <span className={/[A-Z]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>Uppercase</span>
                  <span className={/[0-9]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>Number</span>
                  <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? "text-green-600" : "text-muted-foreground"}>Special char</span>
                </div>
              </div>
              <Input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
              <Button className="w-full rounded-xl" disabled={loading}>
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </>
          )}
        </form>
      </div>

      <footer className="mt-6 text-center text-xs text-gray-500 space-y-1 pb-4">
        <p>&copy; {new Date().getFullYear()} Vibely — Real-time chat, made simple.</p>
      </footer>
    </div>
  );
}
