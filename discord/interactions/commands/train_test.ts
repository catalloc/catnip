import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { economyConfig, _internals as economyConfigInternals } from "../../economy/economy-config.ts";
import { training, TRAINING_BASE_MS } from "../../economy/training.ts";
import command from "./train.ts";

function resetStore() {
  (sqlite as any)._reset();
  economyConfigInternals.configCache.clear();
}

const guildId = "g1";
const userId = "u1";

Deno.test("train: disabled when trainEnabled is false", async () => {
  resetStore();
  await economyConfig.update(guildId, { trainEnabled: false } as any);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", skill: "strength" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("train start: begins training session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", skill: "strength" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Strength"));
});

Deno.test("train start: rejects unknown skill", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "start", skill: "unknown" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Unknown"));
});

Deno.test("train status: no active session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "status" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No active"));
});

Deno.test("train info: shows combat stats", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "info" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Strength"));
  assert(result.embed?.description?.includes("Locked Skills"));
});

Deno.test("train collect: no session", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "collect" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("don't have"));
});
