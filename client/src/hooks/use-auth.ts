import { useState, useEffect } from "react";

const USERNAME_KEY = "chat_app_username";

export function useAuth() {
  const [username, setUsernameState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(USERNAME_KEY);
    if (stored) {
      setUsernameState(stored);
    }
    setIsLoaded(true);
  }, []);

  const setUsername = (name: string) => {
    localStorage.setItem(USERNAME_KEY, name);
    setUsernameState(name);
  };

  const logout = () => {
    localStorage.removeItem(USERNAME_KEY);
    setUsernameState(null);
  };

  return { username, setUsername, logout, isLoaded };
}
