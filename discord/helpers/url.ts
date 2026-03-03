/**
 * URL validation helpers
 *
 * File: discord/helpers/url.ts
 */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
];

/** Validate that a URL is a public HTTP(S) URL — rejects private/reserved IPs and localhost. */
export function isValidPublicUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!/^https?:\/\/.+/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    for (const pattern of PRIVATE_HOST_PATTERNS) {
      if (pattern.test(hostname)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
