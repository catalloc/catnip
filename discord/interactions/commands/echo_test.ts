import "../../../test/_mocks/env.ts";
import { assertEquals, assertStringIncludes } from "../../../test/assert.ts";
import command from "./echo.ts";

Deno.test("echo: echoes message with > prefix", async () => {
  const result = await command.execute({ options: { message: "hello" } } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "> hello");
});

Deno.test("echo: sanitizes mentions in input", async () => {
  const result = await command.execute({ options: { message: "@everyone hi" } } as any);
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "@\u200Beveryone");
  assertEquals(result.message!.includes("@everyone"), false);
});

Deno.test("echo: handles missing options.message", async () => {
  const result = await command.execute({ options: {} } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "> ");
});
