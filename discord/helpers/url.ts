/**
 * URL validation helpers
 *
 * File: discord/helpers/url.ts
 */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[::1\]$/,
  /^\[::\]$/,
  /^\[::ffff:/i,
  /^\[f[cd]/i,   // fc00::/7 (ULA)
  /^\[fe80/i,    // fe80::/10 (link-local)
];

/** Validate that a URL is a public HTTPS URL — rejects private/reserved IPs, localhost, and non-TLS. */
export function isValidPublicUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!/^https:\/\/.+/.test(trimmed)) return false;
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
