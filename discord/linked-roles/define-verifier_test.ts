import { assertEquals } from "@std/assert";
import { defineVerifier, MetadataType } from "./define-verifier.ts";

Deno.test("defineVerifier: passes through input unchanged", () => {
  const input = {
    name: "Test Verifier",
    metadata: [
      { key: "score", name: "Score", description: "User score", type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL },
    ],
    verify: () => ({
      platformName: "Test",
      platformUsername: "user",
      metadata: { score: 42 },
    }),
  };
  const result = defineVerifier(input);
  assertEquals(result, input);
});

Deno.test("MetadataType: enum values match Discord API", () => {
  assertEquals(MetadataType.INTEGER_LESS_THAN_OR_EQUAL, 1);
  assertEquals(MetadataType.INTEGER_GREATER_THAN_OR_EQUAL, 2);
  assertEquals(MetadataType.BOOLEAN_EQUAL, 7);
  assertEquals(MetadataType.BOOLEAN_NOT_EQUAL, 8);
});
