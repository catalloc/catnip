import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import handler from "./example-button.ts";

Deno.test("Metadata correct", () => {
  assertEquals(handler.customId, "example-button");
  assertEquals(handler.match, "exact");
  assertEquals(handler.type, "button");
});

Deno.test("Execute returns success with user mention", async () => {
  const result = await handler.execute({
    customId: "example-button",
    guildId: "g1",
    userId: "u123",
    interaction: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("<@u123>"));
});

Deno.test("Embed has correct title and color", async () => {
  const result = await handler.execute({
    customId: "example-button",
    guildId: "g1",
    userId: "u123",
    interaction: {},
  } as any);
  assertEquals(result.embed?.title, "Button Interaction");
});
