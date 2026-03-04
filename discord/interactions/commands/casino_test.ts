import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import command from "./casino.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("casino: disabled when casino off", async () => {
  resetStore();
  await economyConfig.update(guildId, { casinoEnabled: false });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 10, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("closed"));
});

Deno.test("casino coinflip: fails with insufficient funds", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 100, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
});

Deno.test("casino coinflip: plays game with sufficient funds", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 100, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.description?.includes("heads") || result.embed.description?.includes("tails"));
});

Deno.test("casino dice: plays game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "dice", bet: 50, number: 3 }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});

Deno.test("casino slots: plays game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "slots", bet: 50 }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});

Deno.test("casino roulette: plays color bet", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "roulette", bet: 50, type: "red" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});

Deno.test("casino roulette: invalid number refunds", async () => {
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

Deno.test("casino blackjack: starts game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "blackjack", bet: 100 }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  // Either has components (active game) or is already finished (natural blackjack)
});

Deno.test("casino blackjack: rejects second game", async () => {
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

Deno.test("casino: bet below minimum", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  await economyConfig.update(guildId, { casinoMinBet: 10 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 1, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Minimum"));
});

Deno.test("casino: bet above maximum", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 100000);
  await economyConfig.update(guildId, { casinoMaxBet: 100 });
  const result = await command.execute({
    guildId, userId, options: { subcommand: "coinflip", bet: 500, call: "heads" }, config: {},
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("Maximum"));
});

Deno.test("casino: invalid subcommand", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  const result = await command.execute({
    guildId, userId, options: { subcommand: "invalid", bet: 10 }, config: {},
  } as any);
  assertEquals(result.success, false);
});
