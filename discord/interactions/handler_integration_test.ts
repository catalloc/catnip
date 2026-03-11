import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { handleInteraction } from "./handler.ts";
import { signedRequest } from "../../test/_mocks/sign.ts";

// --- JSON.parse guard ---

Deno.test("handleInteraction: malformed JSON returns 400", async () => {
  const req = await signedRequest("{not valid json");
  const res = await handleInteraction(req);
  assertEquals(res.status, 400);
  assertEquals(await res.text(), "Invalid JSON");
});

Deno.test("handleInteraction: valid PING returns pong", async () => {
  const req = await signedRequest(JSON.stringify({ type: 1 }));
  const res = await handleInteraction(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.type, 1); // PONG
});

// --- Request ID in error responses ---

Deno.test("handleInteraction: unsupported type returns ephemeral response", async () => {
  const req = await signedRequest(JSON.stringify({ type: 999 }));
  const res = await handleInteraction(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.content, "Unsupported interaction type");
  assertEquals(body.data.flags, 64);
});
