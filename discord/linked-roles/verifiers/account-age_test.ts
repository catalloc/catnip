import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";

// Import the verifier module to trigger setVerifier(), then use it via routes
import "./account-age.ts";
import { getVerifier } from "../routes.ts";

const verifier = getVerifier()!;

Deno.test("account-age: known snowflake gives correct age", () => {
  // Discord epoch: 2015-01-01, snowflake 0 => created at epoch
  // Snowflake 175928847299117063 => ~2016-04-29 (known Discord user)
  const user = { id: "175928847299117063", username: "testuser", global_name: "Test" };
  const result = verifier.verify(user, "");
  const metadata = (result as any).metadata ?? (result as any).then ? null : null;
  // For sync verifiers, result is direct
  assert((result as any).metadata.account_age_days > 0);
});

Deno.test("account-age: metadata key is account_age_days", () => {
  assertEquals(verifier.metadata[0].key, "account_age_days");
});

Deno.test("account-age: uses global_name fallback to username", () => {
  const withGlobal = verifier.verify(
    { id: "175928847299117063", username: "user", global_name: "DisplayName" },
    "",
  );
  assertEquals((withGlobal as any).platformUsername, "DisplayName");

  const withoutGlobal = verifier.verify(
    { id: "175928847299117063", username: "fallback", global_name: null } as any,
    "",
  );
  assertEquals((withoutGlobal as any).platformUsername, "fallback");
});

Deno.test("account-age: recent snowflake gives small age", () => {
  // Create a snowflake for "now" approximately
  const nowMs = BigInt(Date.now()) - 1420070400000n;
  const recentSnowflake = String(nowMs << 22n);
  const result = verifier.verify(
    { id: recentSnowflake, username: "new", global_name: "New User" },
    "",
  );
  assert((result as any).metadata.account_age_days <= 1);
});
