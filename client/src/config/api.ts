const rawApiUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "";

export const API_URL = rawApiUrl.replace(/\/+$/, "");

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_URL}${path}`;
}

export function getWebSocketBaseUrl() {
  const configuredWsUrl = (import.meta.env.VITE_WS_BASE_URL || "").replace(/\/+$/, "");
  if (configuredWsUrl) {
    return configuredWsUrl;
  }

  if (API_URL) {
    return API_URL.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  }

  const fallbackProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${fallbackProtocol}//${window.location.host}`;
}
