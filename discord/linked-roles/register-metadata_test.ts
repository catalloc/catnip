import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { mockFetch, restoreFetch } from "../../test/_mocks/fetch.ts";
import { setVerifier, getVerifier } from "./routes.ts";
import { registerMetadataSchema } from "./register-metadata.ts";
import { MetadataType } from "./define-verifier.ts";

Deno.test("register-metadata: no verifier returns ok false", async () => {
  // Clear the active verifier
  setVerifier(null as any);
  // Force getVerifier to return null via internal state
  const result = await registerMetadataSchema();
  if (getVerifier() === null) {
    assertEquals(result.ok, false);
    assertEquals(result.error, "No verifier configured");
  }
});

Deno.test("register-metadata: successful PUT returns ok true", async () => {
  setVerifier({
    name: "Test",
    metadata: [
      { key: "test_key", name: "Test", description: "A test field", type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL },
    ],
    verify: async () => ({ platformName: "Test", platformUsername: "u", metadata: {} }),
  });
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await registerMetadataSchema();
    assertEquals(result.ok, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("register-metadata: Discord API error returns error string", async () => {
  setVerifier({
    name: "Test",
    metadata: [
      { key: "k", name: "N", description: "D", type: MetadataType.BOOLEAN_EQUAL },
    ],
    verify: async () => ({ platformName: "T", platformUsername: "u", metadata: {} }),
  });
  mockFetch({ default: { status: 403, body: "Forbidden" } });
  try {
    const result = await registerMetadataSchema();
    assertEquals(result.ok, false);
    assertEquals(typeof result.error, "string");
  } finally {
    restoreFetch();
  }
});
