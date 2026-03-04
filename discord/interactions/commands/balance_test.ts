import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../economy/accounts.ts";
import command from "./balance.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("balance: shows zero for new user", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.fields?.some((f: any) => f.value.includes("0")));
});

Deno.test("balance: shows correct balance after credit", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 500);
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.fields?.some((f: any) => f.value.includes("500")));
});

Deno.test("balance: can check another user", async () => {
  resetStore();
  await accounts.creditBalance(guildId, "u2", 1000);
  const result = await command.execute({ guildId, userId, options: { user: "u2" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.fields?.some((f: any) => f.value.includes("1,000")));
  assert(result.embed?.footer?.text?.includes("u2"));
});

Deno.test("balance: self footer", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.footer?.text?.includes("Your balance"));
});
