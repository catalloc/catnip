import "../../../test/_mocks/env.ts";
import { assert, assertStringIncludes } from "../../../test/assert.ts";
import coinFlip from "./coin-flip.ts";

Deno.test("coin-flip: returns success with Heads or Tails", async () => {
  const result = await coinFlip.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assert(result.success);
  assert(
    result.message!.includes("Heads") || result.message!.includes("Tails"),
    `Expected Heads or Tails, got: ${result.message}`,
  );
});

Deno.test("coin-flip: message includes bold formatting", async () => {
  const result = await coinFlip.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertStringIncludes(result.message!, "**");
});
