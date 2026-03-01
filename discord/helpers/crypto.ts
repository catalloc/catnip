/**
 * discord/helpers/crypto.ts
 *
 * Cryptographic utilities shared across the bot.
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 * Both strings are compared in full regardless of where they differ.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare `b` against itself to keep constant time relative to length,
    // but still return false for length mismatch.
    let _ = 0;
    for (let i = 0; i < b.length; i++) {
      _ |= b.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Generate a cryptographically secure random index in [0, max).
 * Uses rejection sampling to avoid modulo bias.
 */
export function secureRandomIndex(max: number): number {
  if (max <= 0) return 0;
  const array = new Uint32Array(1);
  // Find the largest multiple of max that fits in 32 bits
  const limit = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);
  return value % max;
}
