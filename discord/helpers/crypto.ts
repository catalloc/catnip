/**
 * discord/helpers/crypto.ts
 *
 * Cryptographic utilities shared across the bot.
 */

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses HMAC comparison to avoid leaking length information.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode("timing-safe-comparison-key");
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const viewA = new Uint8Array(macA);
  const viewB = new Uint8Array(macB);
  if (viewA.length !== viewB.length) return false;
  let mismatch = 0;
  for (let i = 0; i < viewA.length; i++) {
    mismatch |= viewA[i] ^ viewB[i];
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
