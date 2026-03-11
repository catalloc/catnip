import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { duels, resolveDuel, _internals } from "./duels.ts";
import type { DuelSession } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("duels: resolveDuel produces valid result", () => {
  const session: DuelSession = {
    guildId: "g1", challengerId: "u1", targetId: "u2",
    channelId: "ch1", bet: 100, status: "pending", createdAt: Date.now(),
  };
  const result = resolveDuel(session);
  assert(result.winnerId === "u1" || result.winnerId === "u2");
  assert(result.loserId === "u1" || result.loserId === "u2");
  assert(result.winnerId !== result.loserId);
  // 5% house cut: 200 * 0.95 = 190
  assertEquals(result.winnerPayout, 190);
});

Deno.test("duels: resolveDuel both players can win", () => {
  const session: DuelSession = {
    guildId: "g1", challengerId: "u1", targetId: "u2",
    channelId: "ch1", bet: 100, status: "pending", createdAt: Date.now(),
  };
  const winners = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const result = resolveDuel(session);
    winners.add(result.winnerId);
    if (winners.size === 2) break;
  }
  assertEquals(winners.size, 2);
});

Deno.test("duels: winnerPayout scales with bet", () => {
  const session: DuelSession = {
    guildId: "g1", challengerId: "u1", targetId: "u2",
    channelId: "ch1", bet: 1000, status: "pending", createdAt: Date.now(),
  };
  const result = resolveDuel(session);
  assertEquals(result.winnerPayout, 1900);
});

Deno.test("duels session: create and retrieve", async () => {
  resetStore();
  const session = await duels.createSession("g1", "u1", "u2", "ch1", 100);
  assertEquals(session.bet, 100);
  assertEquals(session.challengerId, "u1");
  assertEquals(session.targetId, "u2");
  assertEquals(session.status, "pending");

  const retrieved = await duels.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.bet, 100);
});

Deno.test("duels session: delete", async () => {
  resetStore();
  await duels.createSession("g1", "u1", "u2", "ch1", 50);
  await duels.deleteSession("g1", "u1");
  assertEquals(await duels.getSession("g1", "u1"), null);
});

Deno.test("duels session: expired returns null", async () => {
  resetStore();
  const session = await duels.createSession("g1", "u1", "u2", "ch1", 50);
  // Manually expire — need to write directly since DuelSession doesn't expose TTL
  // The session TTL is 2 minutes
  const key = _internals.sessionKey("g1", "u1");
  // The getSession checks createdAt + SESSION_TTL_MS
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  // Need to write it back to KV. Use the internal key.
  const { kv } = await import("../../persistence/kv.ts");
  await kv.set(key, session);
  assertEquals(await duels.getSession("g1", "u1"), null);
});
