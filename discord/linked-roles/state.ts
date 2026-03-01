/**
 * discord/linked-roles/state.ts
 *
 * Stateless HMAC-SHA256 CSRF protection for the OAuth2 flow.
 * Generates a signed nonce (with embedded timestamp) and verifies it
 * on callback — no KV needed. Tokens expire after 10 minutes.
 */

import { CONFIG } from "../constants.ts";

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/** Import the client secret as an HMAC key (cached after first call). */
let _key: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;
  const enc = new TextEncoder();
  _key = await crypto.subtle.importKey(
    "raw",
    enc.encode(CONFIG.clientSecret),
    ALGORITHM,
    false,
    ["sign", "verify"],
  );
  return _key;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Generate a state parameter: `base64url(payload).base64url(hmac)`.
 * The payload is 16 random bytes + 8-byte big-endian timestamp.
 * The HMAC signs the full payload.
 */
export async function generateState(): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const timestamp = new DataView(new ArrayBuffer(8));
  timestamp.setFloat64(0, Date.now());

  // payload = nonce (16 bytes) + timestamp (8 bytes)
  const payload = new Uint8Array(24);
  payload.set(nonce, 0);
  payload.set(new Uint8Array(timestamp.buffer), 16);

  const key = await getKey();
  const sig = await crypto.subtle.sign(ALGORITHM.name, key, payload);
  return `${toBase64Url(payload.buffer)}.${toBase64Url(sig)}`;
}

/**
 * Verify a state parameter produced by `generateState()`.
 * Returns `true` if the HMAC is valid and the token hasn't expired.
 */
export async function verifyState(state: string): Promise<boolean> {
  const dot = state.indexOf(".");
  if (dot === -1) return false;
  try {
    const payload = fromBase64Url(state.slice(0, dot));
    const sig = fromBase64Url(state.slice(dot + 1));

    if (payload.length !== 24) return false;

    const key = await getKey();
    const valid = await crypto.subtle.verify(ALGORITHM.name, key, sig, payload);
    if (!valid) return false;

    // Extract and check timestamp expiration
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const createdAt = view.getFloat64(16);
    if (Date.now() - createdAt > STATE_MAX_AGE_MS) return false;

    return true;
  } catch {
    return false;
  }
}

export const _internals = { toBase64Url, fromBase64Url, STATE_MAX_AGE_MS };
