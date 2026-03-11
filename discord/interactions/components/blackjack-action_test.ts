import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../games/accounts.ts";
import { blackjack } from "../../games/casino/blackjack.ts";
import component from "./blackjack-action.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("blackjack-action: rejects wrong user", async () => {
  resetStore();
  const result = await component.execute({
    customId: `blackjack:hit:other_user`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("your game"));
});

Deno.test("blackjack-action: rejects when no session", async () => {
  resetStore();
  const result = await component.execute({
    customId: `blackjack:hit:${userId}`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("No active"));
});

Deno.test("blackjack-action hit: draws card", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  await blackjack.createSession(guildId, userId, "ch1", "msg1", 100);

  const result = await component.execute({
    customId: `blackjack:hit:${userId}`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, true);
  assertEquals(result.updateMessage, true);
  assert(result.embed);
});

Deno.test("blackjack-action stand: finishes game", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  await blackjack.createSession(guildId, userId, "ch1", "msg1", 100);

  const result = await component.execute({
    customId: `blackjack:stand:${userId}`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, true);
  assertEquals(result.updateMessage, true);
  assert(result.embed);
  // Session should be deleted
  const session = await blackjack.getSession(guildId, userId);
  assertEquals(session, null);
});

Deno.test("blackjack-action double: doubles bet and finishes", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 1000);
  await blackjack.createSession(guildId, userId, "ch1", "msg1", 100);

  const result = await component.execute({
    customId: `blackjack:double:${userId}`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, true);
  assertEquals(result.updateMessage, true);
  // Session should be deleted
  const session = await blackjack.getSession(guildId, userId);
  assertEquals(session, null);
});

Deno.test("blackjack-action double: fails with insufficient funds", async () => {
  resetStore();
  // Give just enough for the initial bet
  await accounts.creditBalance(guildId, userId, 100);
  await accounts.debitBalance(guildId, userId, 100); // simulate initial bet already taken
  await blackjack.createSession(guildId, userId, "ch1", "msg1", 100);

  const result = await component.execute({
    customId: `blackjack:double:${userId}`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("Insufficient"));
});

Deno.test("blackjack-action: unknown action", async () => {
  resetStore();
  await blackjack.createSession(guildId, userId, "ch1", "msg1", 100);
  const result = await component.execute({
    customId: `blackjack:invalid:${userId}`,
    guildId, userId,
    interaction: {},
  });
  assertEquals(result.success, false);
});
