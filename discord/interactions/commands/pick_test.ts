import "../../../test/_mocks/env.ts";
import { assertEquals, assert, assertStringIncludes } from "../../../test/assert.ts";
import command from "./pick.ts";

Deno.test("pick: picks from valid comma-separated list", async () => {
  const result = await command.execute({ options: { choices: "a, b, c" } } as any);
  assertEquals(result.success, true);
  assert(result.message!.startsWith("I picked: **"));
  assert(["a", "b", "c"].some((c) => result.message!.includes(c)));
});

Deno.test("pick: rejects single item", async () => {
  const result = await command.execute({ options: { choices: "only one" } } as any);
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "at least 2");
});

Deno.test("pick: handles whitespace-only items after filtering", async () => {
  const result = await command.execute({ options: { choices: "a, , ,  " } } as any);
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "at least 2");
});

Deno.test("pick: sanitizes mentions in picked output", async () => {
  const result = await command.execute({ options: { choices: "@everyone, @here" } } as any);
  assertEquals(result.success, true);
  assertEquals(result.message!.includes("@everyone"), false);
  assertEquals(result.message!.includes("@here"), false);
});

Deno.test("pick: handles extra commas and empty segments", async () => {
  const result = await command.execute({ options: { choices: ",,a,,b,," } } as any);
  assertEquals(result.success, true);
  assert(["a", "b"].some((c) => result.message!.includes(c)));
});
