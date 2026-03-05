import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import handler from "./facts-page.ts";
import { FACTS } from "../commands/facts.ts";

Deno.test("facts-page: parses page 0", async () => {
  const result = await handler.execute({ customId: "facts-page:0" } as any);
  assertEquals(result.success, true);
  assertEquals(result.embed!.title, `Fact 1 of ${FACTS.length}`);
  assertEquals(result.embed!.description, FACTS[0]);
});

Deno.test("facts-page: parses page 3", async () => {
  const result = await handler.execute({ customId: "facts-page:3" } as any);
  assertEquals(result.success, true);
  assertEquals(result.embed!.title, `Fact 4 of ${FACTS.length}`);
  assertEquals(result.embed!.description, FACTS[3]);
});

Deno.test("facts-page: NaN fallback to page 0", async () => {
  const result = await handler.execute({ customId: "facts-page:abc" } as any);
  assertEquals(result.success, true);
  assertEquals(result.embed!.title, `Fact 1 of ${FACTS.length}`);
});

Deno.test("facts-page: returns updateMessage true", async () => {
  const result = await handler.execute({ customId: "facts-page:1" } as any);
  assertEquals(result.updateMessage, true);
  assert(result.components);
});

Deno.test("facts-page: metadata", () => {
  assertEquals(handler.customId, "facts-page:");
  assertEquals(handler.match, "prefix");
  assertEquals(handler.type, "button");
});
