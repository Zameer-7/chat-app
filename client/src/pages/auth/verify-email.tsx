import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { resendOtp } from "@/services/api";
import { Button } from "@/components/ui/button";
import { NovaLogo } from "@/components/layout/nova-logo";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

const RESEND_COOLDOWN = 60; // seconds

export default function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const [location, setLocation] = useLocation();

  // Extract email from query string
  const params = new URLSearchParams(location.split("?")[1] || "");
  const email = params.get("email") || "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Redirect if no email
  useEffect(() => {
    if (!email) {
      setLocation("/signup");
    }
  }, [email, setLocation]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;

    setError(null);
    setLoading(true);
    try {
      await verifyEmail(email, otp);
      setLocation("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setResendSuccess(false);
    try {
      await resendOtp(email);
      setResendSuccess(true);
      setResendCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!email) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e7ece7] px-4 py-8">
      <div className="pointer-events-none absolute -left-24 top-4 h-72 w-72 rounded-full bg-teal-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <form
          onSubmit={onVerify}
          className="w-full space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur"
        >
          <NovaLogo />
          <div>
            <h1 className="text-2xl font-black">Verify your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-semibold">{email}</span>
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {resendSuccess && (
            <p className="text-sm text-green-600">A new code has been sent to your email.</p>
          )}

          <div className="flex justify-center">
            <InputOTP maxLength={6} value={otp} onChange={setOtp}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            className="w-full rounded-xl"
            disabled={loading || otp.length !== 6}
          >
            {loading ? "Verifying…" : "Verify Email"}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{" "}
            <button
              type="button"
              onClick={onResend}
              disabled={resendCooldown > 0}
              className="font-semibold underline disabled:opacity-50 disabled:no-underline"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Wrong email?{" "}
            <Link href="/signup">
              <a className="font-semibold underline">Go back</a>
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
