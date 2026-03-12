import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig, _internals as gamesConfigInternals } from "../../games/games-config.ts";
import command from "./daily.ts";

function resetStore() {
  (sqlite as any)._reset();
  gamesConfigInternals.configCache.clear();
}

const guildId = "g1";
const userId = "u1";

Deno.test("daily: grants coins within configured range", async () => {
  resetStore();
  await gamesConfig.update(guildId, { dailyMin: 100, dailyMax: 100 });
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.description?.includes("100"));
  const account = await accounts.getAccount(guildId, userId);
  assertEquals(account?.balance, 100);
});

Deno.test("daily: uses default range when not configured", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  const account = await accounts.getAccount(guildId, userId);
  assert(account!.balance >= 50 && account!.balance <= 150);
});

Deno.test("daily: disabled returns error", async () => {
  resetStore();
  await gamesConfig.update(guildId, { dailyEnabled: false });
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("daily: has 24h cooldown configured", () => {
  assertEquals(command.cooldown, 86400);
});
