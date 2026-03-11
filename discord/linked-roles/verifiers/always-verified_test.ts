import "../../../test/_mocks/env.ts";
import { assertEquals } from "../../../test/assert.ts";
import { defineVerifier, MetadataType } from "../define-verifier.ts";

// Re-create the verifier locally to test it without the side effect of setVerifier
const alwaysVerified = defineVerifier({
  name: "Always Verified",
  metadata: [
    {
      key: "verified",
      name: "Verified",
      description: "Whether the user has been verified",
      type: MetadataType.BOOLEAN_EQUAL,
    },
  ],
  verify(user, _accessToken) {
    return {
      platformName: "Catnip",
      platformUsername: user.global_name ?? user.username,
      metadata: { verified: 1 },
    };
  },
});

const baseUser = {
  id: "1",
  username: "testuser",
  discriminator: "0",
  avatar: null,
  global_name: "TestGlobal" as string | null,
};

Deno.test("verify returns metadata with verified=1", () => {
  const result = alwaysVerified.verify(baseUser, "token");
  assertEquals((result as any).metadata, { verified: 1 });
});

Deno.test("Uses global_name when present", () => {
  const result = alwaysVerified.verify(baseUser, "token");
  assertEquals((result as any).platformUsername, "TestGlobal");
});

Deno.test("Falls back to username when global_name is null", () => {
  const user = { ...baseUser, global_name: null };
  const result = alwaysVerified.verify(user, "token");
  assertEquals((result as any).platformUsername, "testuser");
});
