import "../../../test/_mocks/env.ts";
import { assertEquals, assertStringIncludes } from "../../../test/assert.ts";
import command from "./slow-echo.ts";

Deno.test("slow-echo: default delay is 3 seconds", async () => {
  const result = await command.execute({ options: { message: "hi" } } as any);
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "delayed 3s");
});

Deno.test("slow-echo: delay < 1 clamped to 1", async () => {
  const result = await command.execute({ options: { message: "hi", delay: -5 } } as any);
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "delayed 1s");
});

Deno.test("slow-echo: delay > 10 clamped to 10", async () => {
  const result = await command.execute({ options: { message: "hi", delay: 99 } } as any);
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "delayed 10s");
});

Deno.test("slow-echo: sanitizes mentions", async () => {
  const result = await command.execute({ options: { message: "@everyone hello", delay: 1 } } as any);
  assertEquals(result.success, true);
  assertEquals(result.message!.includes("@everyone"), false);
  assertStringIncludes(result.message!, "@\u200Beveryone");
});

// ── Batch 4m tests ──

Deno.test("slow-echo: delay exactly 1 is accepted", async () => {
  const result = await command.execute({ options: { message: "boundary low", delay: 1 } } as any);
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "delayed 1s");
});

Deno.test("slow-echo: delay exactly 10 is accepted", async () => {
  const result = await command.execute({ options: { message: "boundary high", delay: 10 } } as any);
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "delayed 10s");
});
