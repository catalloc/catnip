import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { gamesConfig, _internals as gamesConfigInternals } from "../../games/games-config.ts";
import command from "./games-admin.ts";

function resetStore() {
  (sqlite as any)._reset();
  gamesConfigInternals.configCache.clear();
}

const guildId = "g1";
const userId = "admin1";

Deno.test("games-config info: shows defaults", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "info" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.fields?.some((f: any) => f.value.includes("Coins")));
});

Deno.test("games-config setup: updates currency name", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "setup", "currency-name": "Gold" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  const config = await gamesConfig.get(guildId);
  assertEquals(config.currencyName, "Gold");
});

Deno.test("games-config setup: rejects no changes", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "setup" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});

Deno.test("games-config setup: rejects negative starting balance", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "setup", "starting-balance": -10 }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});

Deno.test("games-config casino: toggles enabled", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "casino", enabled: false }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  const config = await gamesConfig.get(guildId);
  assertEquals(config.casinoEnabled, false);
});

Deno.test("games-config casino: updates bet limits", async () => {
  resetStore();
  await command.execute({
    guildId, userId, options: { subcommand: "casino", "min-bet": 5, "max-bet": 500 }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  const config = await gamesConfig.get(guildId);
  assertEquals(config.casinoMinBet, 5);
  assertEquals(config.casinoMaxBet, 500);
});

Deno.test("games-config reset: restores defaults", async () => {
  resetStore();
  await gamesConfig.update(guildId, { currencyName: "Custom", casinoMaxBet: 1 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "reset" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  const config = await gamesConfig.get(guildId);
  assertEquals(config.currencyName, "Coins");
  assertEquals(config.casinoMaxBet, 10000);
});

Deno.test("games-config: invalid subcommand", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "invalid" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});
