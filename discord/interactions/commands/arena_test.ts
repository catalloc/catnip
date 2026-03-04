import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import command from "./arena.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("arena: disabled when arenaEnabled is false", async () => {
  resetStore();
  await economyConfig.update(guildId, { arenaEnabled: false } as any);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "fight" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("arena fight: starts battle with auto-pick", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "fight" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.title?.includes("Arena"));
  assert(result.embed?.description?.includes("HP"));
  assert(result.components && result.components.length > 0);
});

Deno.test("arena fight: starts battle with specific monster", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "fight", monster: "slime" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.title?.includes("Slime"));
});

Deno.test("arena fight: rejects monster above level", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "fight", monster: "dragon-whelp" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Level 32"));
});

Deno.test("arena monsters: shows list", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "monsters" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Slime"));
  assert(result.embed?.description?.includes("Ancient Golem"));
});
