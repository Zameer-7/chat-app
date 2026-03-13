import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovaLogo } from "@/components/layout/nova-logo";

export default function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const redirectParam = new URLSearchParams(window.location.search).get("redirect") || undefined;
  const safeRedirect = redirectParam?.startsWith("/") && !redirectParam.startsWith("//")
    ? redirectParam
    : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password, safeRedirect);
      setLocation(safeRedirect);
    } catch (err) {
      const message = (err as Error).message;
      if (message.toLowerCase().includes("verify your email")) {
        setLocation(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e7ece7] px-4 py-8">
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <form onSubmit={onSubmit} className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur">
          <NovaLogo />
          <div>
            <h1 className="text-2xl font-black">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to continue chatting</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="flex justify-end -mt-2">
            <Link href="/forgot-password"><a className="text-xs font-medium text-muted-foreground hover:text-foreground underline">Forgot Password?</a></Link>
          </div>
          <Button className="w-full rounded-xl" disabled={loading}>{loading ? "Signing in..." : "Login"}</Button>
          <p className="text-sm text-muted-foreground">
            No account? <Link href="/signup"><a className="font-semibold underline">Create one</a></Link>
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
