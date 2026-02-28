/**
 * discord/linked-roles/state.ts
 *
 * Stateless HMAC-SHA256 CSRF protection for the OAuth2 flow.
 * Generates a signed nonce and verifies it on callback — no KV needed.
 */

import { CONFIG } from "../constants.ts";

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

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
 * Generate a state parameter: `base64url(nonce).base64url(hmac)`.
 * The nonce is 16 random bytes; the HMAC signs it.
 */
export async function generateState(): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const key = await getKey();
  const sig = await crypto.subtle.sign(ALGORITHM.name, key, nonce);
  return `${toBase64Url(nonce.buffer)}.${toBase64Url(sig)}`;
}

/**
 * Verify a state parameter produced by `generateState()`.
 * Returns `true` if the HMAC is valid.
 */
export async function verifyState(state: string): Promise<boolean> {
  const dot = state.indexOf(".");
  if (dot === -1) return false;
  try {
    const nonce = fromBase64Url(state.slice(0, dot));
    const sig = fromBase64Url(state.slice(dot + 1));
    const key = await getKey();
    return await crypto.subtle.verify(ALGORITHM.name, key, sig, nonce);
  } catch {
    return false;
  }
}

export const _internals = { toBase64Url, fromBase64Url };
