/**
 * Server-side input sanitization utilities.
 * Strips HTML tags and script content from user-supplied strings.
 */

const HTML_TAG_RE = /<\/?[^>]+(>|$)/g;
const SCRIPT_CONTENT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

/** Strip all HTML tags from a string */
export function stripHtml(input: string): string {
  return input
    .replace(SCRIPT_CONTENT_RE, "")
    .replace(HTML_TAG_RE, "")
    .trim();
}

/** Sanitize a user text field (username, nickname, bio, room name, message) */
export function sanitizeText(input: string): string {
  return stripHtml(input);
}

/** Validate that a redirect path is safe (internal only) */
export function isSafeRedirect(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  // Must start with single "/" and not "//" (protocol-relative)
  return url.startsWith("/") && !url.startsWith("//");
}

/** Returns a safe redirect path, defaulting to /dashboard */
export function getSafeRedirect(url: string | undefined | null, fallback = "/dashboard"): string {
  if (url && isSafeRedirect(url)) return url;
  return fallback;
}
