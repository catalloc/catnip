import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig, _internals as economyConfigInternals } from "../../economy/economy-config.ts";
import { xp } from "../../economy/xp.ts";
import { idleActions, FARM_TIERS } from "../../economy/idle-actions.ts";
import command from "./farm.ts";

function resetStore() {
  (sqlite as any)._reset();
  economyConfigInternals.configCache.clear();
}

const guildId = "g1";
const userId = "u1";

Deno.test("farm: disabled when farmEnabled is false", async () => {
  resetStore();
  await economyConfig.update(guildId, { farmEnabled: false } as any);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "wheat" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("farm start: plants wheat at level 0", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "wheat" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Wheat"));
});

Deno.test("farm start: rejects tier above player level", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "corn" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Level 5"));
});

Deno.test("farm start: allows tier when level met", async () => {
  resetStore();
  await xp.grantXp(guildId, userId, 3000); // enough for level 5 (needs ~2820)
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "corn" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Corn"));
});

Deno.test("farm harvest: no active session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "harvest" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("don't have"));
});

Deno.test("farm status: no active session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "status" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No active"));
});

Deno.test("farm info: shows tiers", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "info" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Wheat"));
  assert(result.embed?.description?.includes("Golden Apples"));
});

Deno.test("farm start: unknown crop type", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "unknown" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Unknown"));
});
