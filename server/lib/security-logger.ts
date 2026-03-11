/**
 * Structured security event logger.
 * Logs suspicious behavior: invalid redirects, injection attempts, etc.
 */

type SecurityEvent =
  | "INVALID_REDIRECT"
  | "LOGIN_FAILURE"
  | "SCRIPT_INJECTION"
  | "RATE_LIMIT_HIT"
  | "INVALID_TOKEN"
  | "SUSPICIOUS_INPUT";

export function logSecurity(event: SecurityEvent, details: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, event, ...details };
  console.warn(`[SECURITY] ${JSON.stringify(entry)}`);
}
