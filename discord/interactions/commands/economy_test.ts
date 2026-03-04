import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import command from "./economy.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "admin1";

Deno.test("economy info: shows defaults", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "info" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.fields?.some((f: any) => f.value.includes("Coins")));
});

Deno.test("economy setup: updates currency name", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "setup", "currency-name": "Gold" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  const config = await economyConfig.get(guildId);
  assertEquals(config.currencyName, "Gold");
});

Deno.test("economy setup: rejects no changes", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "setup" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});

Deno.test("economy setup: rejects negative starting balance", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "setup", "starting-balance": -10 }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});

Deno.test("economy casino: toggles enabled", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "casino", enabled: false }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  const config = await economyConfig.get(guildId);
  assertEquals(config.casinoEnabled, false);
});

Deno.test("economy casino: updates bet limits", async () => {
  resetStore();
  await command.execute({
    guildId, userId, options: { subcommand: "casino", "min-bet": 5, "max-bet": 500 }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  const config = await economyConfig.get(guildId);
  assertEquals(config.casinoMinBet, 5);
  assertEquals(config.casinoMaxBet, 500);
});

Deno.test("economy job: toggles enabled", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "job", enabled: false }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("disabled"));
});

Deno.test("economy crime: updates settings", async () => {
  resetStore();
  await command.execute({
    guildId, userId, options: { subcommand: "crime", enabled: true, fines: false }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  const config = await economyConfig.get(guildId);
  assertEquals(config.crimeEnabled, true);
  assertEquals(config.crimeFineEnabled, false);
});

Deno.test("economy reset: restores defaults", async () => {
  resetStore();
  await economyConfig.update(guildId, { currencyName: "Custom", casinoMaxBet: 1 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "reset" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  const config = await economyConfig.get(guildId);
  assertEquals(config.currencyName, "Coins");
  assertEquals(config.casinoMaxBet, 10000);
});

Deno.test("economy: invalid subcommand", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "invalid" }, config: {},
    memberRoles: [], memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});
