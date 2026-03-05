import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { patreonKvKey } from "./patreon.ts";

// Import the verifier to trigger setVerifier
import "./patreon.ts";
import { getVerifier } from "../routes.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const verifier = getVerifier()!;
const user = { id: "u1", username: "testuser", global_name: "Test" };

Deno.test("patreon: patreonKvKey format", () => {
  assertEquals(patreonKvKey("123"), "patreon:discord:123");
});

Deno.test("patreon: active patron returns is_patron 1", async () => {
  resetStore();
  await kv.set(patreonKvKey("u1"), {
    isPatron: true,
    patronStatus: "active_patron",
    tier: "gold",
    updatedAt: new Date().toISOString(),
  });
  const result = await verifier.verify(user, "");
  assertEquals(result.metadata.is_patron, 1);
});

Deno.test("patreon: inactive patron returns is_patron 0", async () => {
  resetStore();
  await kv.set(patreonKvKey("u1"), {
    isPatron: false,
    patronStatus: "declined_patron",
    tier: "none",
    updatedAt: new Date().toISOString(),
  });
  const result = await verifier.verify(user, "");
  assertEquals(result.metadata.is_patron, 0);
});

Deno.test("patreon: missing KV record returns is_patron 0", async () => {
  resetStore();
  const result = await verifier.verify(user, "");
  assertEquals(result.metadata.is_patron, 0);
});
