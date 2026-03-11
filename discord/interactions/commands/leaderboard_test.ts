import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../games/accounts.ts";
import command from "./leaderboard.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("leaderboard: shows message when empty", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No one"));
});

Deno.test("leaderboard: shows ranked users", async () => {
  resetStore();
  await accounts.creditBalance(guildId, "u1", 100);
  await accounts.creditBalance(guildId, "u2", 500);
  await accounts.creditBalance(guildId, "u3", 300);
  const result = await command.execute({ guildId, userId, options: {}, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  const desc = result.embed.description ?? "";
  // u2 should be first (500), u3 second (300), u1 third (100)
  const u2Pos = desc.indexOf("u2");
  const u3Pos = desc.indexOf("u3");
  const u1Pos = desc.indexOf("u1");
  assert(u2Pos < u3Pos);
  assert(u3Pos < u1Pos);
});

Deno.test("leaderboard: pagination works", async () => {
  resetStore();
  // Create 15 users
  for (let i = 1; i <= 15; i++) {
    await accounts.creditBalance(guildId, `user${i}`, i * 10);
  }
  const page1 = await command.execute({ guildId, userId, options: { page: 1 }, config: {} } as any);
  assertEquals(page1.success, true);
  assert(page1.embed?.footer?.text?.includes("Page 1/2"));

  const page2 = await command.execute({ guildId, userId, options: { page: 2 }, config: {} } as any);
  assertEquals(page2.success, true);
  assert(page2.embed?.footer?.text?.includes("Page 2/2"));
});

Deno.test("leaderboard: page clamped to max", async () => {
  resetStore();
  await accounts.creditBalance(guildId, "u1", 100);
  const result = await command.execute({ guildId, userId, options: { page: 99 }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.footer?.text?.includes("Page 1/1"));
});
