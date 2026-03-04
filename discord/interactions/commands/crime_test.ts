import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { crimes } from "../../economy/crimes.ts";
import command, { _internals } from "./crime.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("crime formatDuration: minutes", () => {
  assertEquals(_internals.formatDuration(5 * 60_000), "5m");
});

Deno.test("crime formatDuration: hours and minutes", () => {
  assertEquals(_internals.formatDuration(90 * 60_000), "1h 30m");
});

Deno.test("crime: disabled when crime off", async () => {
  resetStore();
  await economyConfig.update(guildId, { crimeEnabled: false });
  const result = await command.execute({
    guildId, userId, options: { type: "pickpocket" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});

Deno.test("crime: unknown crime type", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { type: "unknown" }, config: {},
  } as any);
  assertEquals(result.success, false);
});

Deno.test("crime pickpocket: commits crime", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 5000); // enough to cover any fine
  const result = await command.execute({
    guildId, userId, options: { type: "pickpocket" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.description?.includes("Pickpocket"));
});

Deno.test("crime: respects cooldown", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 5000);
  // First crime
  await command.execute({
    guildId, userId, options: { type: "pickpocket" }, config: {},
  } as any);
  // Second crime immediately — should be on cooldown
  const result = await command.execute({
    guildId, userId, options: { type: "pickpocket" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("laying low"));
});

Deno.test("crime: fines disabled mode", async () => {
  resetStore();
  await economyConfig.update(guildId, { crimeFineEnabled: false });
  // Use carjacking (50% success, level 0 not required for pickpocket but we want failures)
  // Actually use pickpocket and run many times — 80% success so 20% chance of failure each time
  for (let i = 0; i < 50; i++) {
    // Reset cooldown each time by clearing store
    (sqlite as any)._reset();
    await economyConfig.update(guildId, { crimeFineEnabled: false });
    const result = await command.execute({
      guildId, userId, options: { type: "pickpocket" }, config: {},
    } as any);
    assertEquals(result.success, true);
    if (result.embed?.description?.includes("caught")) {
      assert(result.embed.description.includes("escaped without a fine"));
      return; // Found a failure case — test passes
    }
  }
  // With 80% success rate for pickpocket, probability of all 50 succeeding is ~0.001%
  assert(false, "Expected at least one failed crime in 50 attempts");
});
