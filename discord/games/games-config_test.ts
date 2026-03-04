import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { gamesConfig, _internals } from "./games-config.ts";

function resetStore() {
  (sqlite as any)._reset();
  _internals.configCache.clear();
}

Deno.test("gamesConfig _internals.configKey: correct format", () => {
  assertEquals(_internals.configKey("g1"), "economy_config:g1");
});

Deno.test("gamesConfig get: returns defaults for new guild", async () => {
  resetStore();
  const config = await gamesConfig.get("g1");
  assertEquals(config.guildId, "g1");
  assertEquals(config.currencyName, "Coins");
  assertEquals(config.currencyEmoji, "\u{1FA99}");
  assertEquals(config.casinoEnabled, true);
  assertEquals(config.casinoMaxBet, 10000);
  assertEquals(config.startingBalance, 0);
});

Deno.test("gamesConfig update: merges changes", async () => {
  resetStore();
  const updated = await gamesConfig.update("g1", { currencyName: "Gold", casinoMaxBet: 5000 });
  assertEquals(updated.currencyName, "Gold");
  assertEquals(updated.casinoMaxBet, 5000);
  assertEquals(updated.casinoEnabled, true); // unchanged
});

Deno.test("gamesConfig update: persists changes", async () => {
  resetStore();
  await gamesConfig.update("g1", { currencyName: "Gems" });
  const config = await gamesConfig.get("g1");
  assertEquals(config.currencyName, "Gems");
});

Deno.test("gamesConfig reset: restores defaults", async () => {
  resetStore();
  await gamesConfig.update("g1", { currencyName: "Custom", casinoMaxBet: 999 });
  const reset = await gamesConfig.reset("g1");
  assertEquals(reset.currencyName, "Coins");
  assertEquals(reset.casinoMaxBet, 10000);
});
