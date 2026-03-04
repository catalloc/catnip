import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { xp } from "../../economy/xp.ts";
import command from "./mine.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("mine: disabled when mineEnabled is false", async () => {
  resetStore();
  await economyConfig.update(guildId, { mineEnabled: false } as any);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "copper" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("mine start: starts copper at level 0", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "copper" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Copper"));
});

Deno.test("mine start: rejects tier above player level", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", type: "iron" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Level 5"));
});

Deno.test("mine info: shows tiers", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "info" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Copper"));
  assert(result.embed?.description?.includes("Diamonds"));
});

Deno.test("mine harvest: no active session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "harvest" }, config: {},
  } as any);
  assertEquals(result.success, false);
});
