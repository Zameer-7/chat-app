import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getCurrentUser,
  login as loginApi,
  setToken,
  signup as signupApi,
  verifyEmail as verifyEmailApi,
  type SafeUser,
} from "@/services/api";

type AuthContextValue = {
  user: SafeUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string, captchaId: string, captchaAnswer: string) => Promise<string | null>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  setUser: (user: SafeUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applyTheme(theme: SafeUser["chatTheme"] | null) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark" || theme === "midnight");
  if (theme) {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const current = await getCurrentUser();
        if (mounted) {
          setUserState(current);
        }
      } catch {
        setToken(null);
        if (mounted) {
          setUserState(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    applyTheme(user?.chatTheme ?? null);
  }, [user?.chatTheme]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email: string, password: string) {
        const result = await loginApi({ email, password });
        setToken(result.token);
        setUserState(result.user);
      },
      async signup(username: string, email: string, password: string, captchaId: string, captchaAnswer: string) {
        const result = await signupApi({ username, email, password, captchaId, captchaAnswer });
        if ("token" in result) {
          // Email not configured — user was auto-verified
          setToken(result.token);
          setUserState(result.user);
          return null;
        }
        // Email verification required — return email for redirect
        return result.email;
      },
      async verifyEmail(email: string, otp: string) {
        const result = await verifyEmailApi({ email, otp });
        setToken(result.token);
        setUserState(result.user);
      },
      setUser(updated: SafeUser) {
        setUserState(updated);
      },
      logout() {
        setToken(null);
        setUserState(null);
        applyTheme(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
