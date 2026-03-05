import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import command from "./counter.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";

Deno.test("counter: first increment returns 1", async () => {
  resetStore();
  const result = await command.execute({ guildId, options: {} } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "Counter: **1**");
});

Deno.test("counter: second increment returns 2", async () => {
  resetStore();
  await command.execute({ guildId, options: {} } as any);
  const result = await command.execute({ guildId, options: {} } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "Counter: **2**");
});

Deno.test("counter: reset sets counter to 0", async () => {
  resetStore();
  await command.execute({ guildId, options: {} } as any);
  const result = await command.execute({ guildId, options: { action: "reset" } } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "Counter reset to **0**.");
});

Deno.test("counter: increment after reset starts from 1", async () => {
  resetStore();
  await command.execute({ guildId, options: {} } as any);
  await command.execute({ guildId, options: { action: "reset" } } as any);
  const result = await command.execute({ guildId, options: {} } as any);
  assertEquals(result.success, true);
  assertEquals(result.message, "Counter: **1**");
});

Deno.test("counter: default action (no option) is increment", async () => {
  resetStore();
  const r1 = await command.execute({ guildId, options: {} } as any);
  assertEquals(r1.message, "Counter: **1**");
  const r2 = await command.execute({ guildId, options: { action: undefined } } as any);
  assertEquals(r2.message, "Counter: **2**");
});

Deno.test("counter: case-insensitive Reset", async () => {
  resetStore();
  await command.execute({ guildId, options: {} } as any);
  const r1 = await command.execute({ guildId, options: { action: "Reset" } } as any);
  assertEquals(r1.message, "Counter reset to **0**.");
  await command.execute({ guildId, options: {} } as any);
  const r2 = await command.execute({ guildId, options: { action: "RESET" } } as any);
  assertEquals(r2.message, "Counter reset to **0**.");
});
