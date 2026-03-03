/**
 * test/_mocks/sign.ts
 *
 * Ed25519 signing helper for testing Discord signature verification.
 * The private key here matches the public key in env.ts.
 */

const PKCS8_HEX = "302e020100300506032b6570042204202197bb0a1f75ba922bb1fa1fcb5e28668bb7ebbccc30566b1f1837984bf65bf5";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let cachedPrivateKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (!cachedPrivateKey) {
    cachedPrivateKey = await crypto.subtle.importKey(
      "pkcs8",
      hexToBytes(PKCS8_HEX),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
  }
  return cachedPrivateKey;
}

/**
 * Sign a request body for Discord interaction verification.
 * Returns the signature hex and a fresh timestamp.
 */
export async function signBody(body: string): Promise<{ signature: string; timestamp: string }> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await getPrivateKey();
  const message = new TextEncoder().encode(timestamp + body);
  const sigBuf = await crypto.subtle.sign("Ed25519", key, message);
  return { signature: bytesToHex(new Uint8Array(sigBuf)), timestamp };
}

/**
 * Build a signed Request for handleInteraction.
 */
export async function signedRequest(body: string): Promise<Request> {
  const { signature, timestamp } = await signBody(body);
  return new Request("https://example.com/", {
    method: "POST",
    body,
    headers: {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": timestamp,
    },
  });
}
