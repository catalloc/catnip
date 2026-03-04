import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import command from "./forage.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("forage: disabled when forageEnabled is false", async () => {
  resetStore();
  await economyConfig.update(guildId, { forageEnabled: false } as any);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "herbs" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("forage start: starts herbs at level 0", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "herbs" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Herbs"));
});

Deno.test("forage start: rejects tier above player level", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "mushrooms" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Level 4"));
});

Deno.test("forage info: shows tiers", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "info" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Herbs"));
  assert(result.embed?.description?.includes("Ancient Relics"));
});

Deno.test("forage harvest: no active session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "harvest" }, config: {},
  } as any);
  assertEquals(result.success, false);
});
