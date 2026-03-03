import "../../test/_mocks/env.ts";
import { assert, assertEquals } from "@std/assert";
import { generateState, verifyState, _internals } from "./state.ts";

const { toBase64Url, fromBase64Url } = _internals;

// --- toBase64Url / fromBase64Url ---

Deno.test("toBase64Url/fromBase64Url: roundtrip preserves data", () => {
  const original = new Uint8Array([0, 1, 2, 255, 128, 64]);
  const encoded = toBase64Url(original.buffer);
  const decoded = fromBase64Url(encoded);
  assertEquals(decoded, original);
});

Deno.test("toBase64Url: produces URL-safe characters (no +, /, =)", () => {
  const bytes = new Uint8Array([251, 255, 254, 253, 63, 62]);
  const encoded = toBase64Url(bytes.buffer);
  assert(!encoded.includes("+"));
  assert(!encoded.includes("/"));
  assert(!encoded.includes("="));
});

// --- generateState / verifyState ---

Deno.test("generateState: format is nonce.signature", async () => {
  const state = await generateState();
  const parts = state.split(".");
  assertEquals(parts.length, 2);
  assert(parts[0].length > 0);
  assert(parts[1].length > 0);
});

Deno.test("verifyState: valid state verifies", async () => {
  const state = await generateState();
  assertEquals(await verifyState(state), true);
});

Deno.test("verifyState: tampered state fails", async () => {
  const state = await generateState();
  const tampered = state.slice(0, -3) + "xxx";
  assertEquals(await verifyState(tampered), false);
});

Deno.test("verifyState: malformed input returns false", async () => {
  assertEquals(await verifyState("nodotshere"), false);
  assertEquals(await verifyState(""), false);
});
