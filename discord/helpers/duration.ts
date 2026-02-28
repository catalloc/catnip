/**
 * discord/helpers/duration.ts
 *
 * Parse human-readable duration strings into milliseconds.
 * Used by giveaway and remind commands.
 */

const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a human-readable duration string into milliseconds.
 *
 * Supports: `s` (seconds), `m` (minutes), `h` (hours), `d` (days).
 * Combinable: `1d12h`, `2h30m`, `1h30m15s`.
 *
 * Returns `null` on invalid input or if duration exceeds 30 days.
 *
 * @example
 * parseDuration("1h30m") // 5400000
 * parseDuration("2d")    // 172800000
 * parseDuration("bad")   // null
 */
export function parseDuration(input: string): number | null {
  if (!input || typeof input !== "string") return null;

  const pattern = /(\d+)\s*([smhd])/gi;
  let total = 0;
  let matched = false;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const ms = UNIT_MS[unit];
    if (!ms || value <= 0) continue;
    total += value * ms;
    matched = true;
  }

  if (!matched || total <= 0) return null;
  if (total > MAX_DURATION_MS) return null;

  return total;
}
