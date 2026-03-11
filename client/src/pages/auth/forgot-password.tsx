import { useState } from "react";
import { Link, useLocation } from "wouter";
import { forgotPassword, verifyResetCode } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovaLogo } from "@/components/layout/nova-logo";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSuccess("Reset code sent to your email");
      setStep("code");
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await verifyResetCode(email, code);
      setSuccess("Code verified successfully");
      setTimeout(() => {
        setLocation(`/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`);
      }, 500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (cooldown > 0) return;
    setError(null);
    setSuccess(null);
    try {
      await forgotPassword(email);
      setSuccess("A new code has been sent to your email");
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e7ece7] px-4 py-8">
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        {step === "email" ? (
          <form onSubmit={handleSendCode} className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur">
            <NovaLogo />
            <div>
              <h1 className="text-2xl font-black">Forgot Password</h1>
              <p className="text-sm text-muted-foreground">Enter your email to receive a reset code</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button className="w-full rounded-xl" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Code"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link href="/login">
                <a className="font-semibold underline">Back to Login</a>
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur">
            <NovaLogo />
            <div>
              <h1 className="text-2xl font-black">Enter Reset Code</h1>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit code to <span className="font-medium">{email}</span>
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-[0.4em]"
              required
            />
            <Button className="w-full rounded-xl" disabled={loading || code.length !== 6}>
              {loading ? "Verifying..." : "Verify Code"}
            </Button>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <button
                type="button"
                className="font-semibold underline disabled:opacity-50 disabled:no-underline"
                disabled={cooldown > 0}
                onClick={handleResendCode}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
              </button>
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => { setStep("email"); setCode(""); setError(null); setSuccess(null); }}
              >
                Change Email
              </button>
            </div>
          </form>
        )}
      </div>

      <footer className="mt-6 text-center text-xs text-gray-500 space-y-1 pb-4">
        <p>&copy; {new Date().getFullYear()} Vibely — Real-time chat, made simple.</p>
      </footer>
    </div>
  );
}
