import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ChatPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/rooms");
  }, [setLocation]);

  return <div className="min-h-screen flex items-center justify-center">Redirecting...</div>;
}
