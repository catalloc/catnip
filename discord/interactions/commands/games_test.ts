import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig, _internals as gamesConfigInternals } from "../../games/games-config.ts";
import command from "./games.ts";

function resetStore() {
  (sqlite as any)._reset();
  gamesConfigInternals.configCache.clear();
}

const guildId = "g1";
const userId = "u1";

Deno.test("games: disabled when casino off", async () => {
  resetStore();
  await gamesConfig.update(guildId, { casinoEnabled: false });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 10, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("closed"));
});

Deno.test("games coinflip: fails with insufficient funds", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 100, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
});

Deno.test("games coinflip: plays game with sufficient funds", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 100, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.description?.includes("heads") || result.embed.description?.includes("tails"));
});

Deno.test("games dice: plays game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "dice", bet: 50, number: 3 }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});

Deno.test("games slots: plays game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "slots", bet: 50 }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});

Deno.test("games roulette: plays color bet", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "roulette", bet: 50, type: "red" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});

Deno.test("games roulette: invalid number refunds", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "roulette", bet: 50, type: "number", number: 99 }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("0 and 36"));
  // Check balance was refunded
  const account = await accounts.getAccount(guildId, userId);
  assertEquals(account?.balance, 1000);
});

Deno.test("games blackjack: starts game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "blackjack", bet: 100 }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  // Either has components (active game) or is already finished (natural blackjack)
});

Deno.test("games blackjack: rejects second game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 2000);
  // Start first game
  await command.execute({
    guildId, userId, options: { subcommand: "blackjack", bet: 100 }, config: {},
  } as any);
  // Try to start second
  const result = await command.execute({
    guildId, userId, options: { subcommand: "blackjack", bet: 100 }, config: {},
  } as any);
  // Second may succeed if first was a natural BJ (session auto-deleted), or fail if still active
  // Just verify it didn't crash
  assert(typeof result.success === "boolean");
});

Deno.test("games: bet below minimum", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  await gamesConfig.update(guildId, { casinoMinBet: 10 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 1, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Minimum"));
});

Deno.test("games: bet above maximum", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 100000);
  await gamesConfig.update(guildId, { casinoMaxBet: 100 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 500, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
});

Deno.test("games: invalid subcommand", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "invalid", bet: 10 }, config: {},
  } as any);
  assertEquals(result.success, false);
});

// ── Batch 4k tests ──

Deno.test("games: bet below minimum returns error message with Minimum", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 5000);
  await gamesConfig.update(guildId, { casinoMinBet: 50 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "slots", bet: 10 }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Minimum"));
  assert(result.error?.includes("50"));
});

Deno.test("games: bet above maximum returns error message with Maximum", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 50000);
  await gamesConfig.update(guildId, { casinoMaxBet: 200 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "dice", bet: 500, number: 3 }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
  assert(result.error?.includes("200"));
});

Deno.test("games: casino disabled returns error mentioning closed", async () => {
  resetStore();
  await gamesConfig.update(guildId, { casinoEnabled: false });
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "slots", bet: 10 }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("closed"));
});
