import "../../../test/_mocks/env.ts";
import { assertEquals, assert, assertNotEquals } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { rps, resolveRps, choiceEmoji, _internals } from "./rps.ts";
import type { RpsSession } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeSession(overrides: Partial<RpsSession> = {}): RpsSession {
  return {
    guildId: "g1",
    challengerId: "u1",
    targetId: "u2",
    channelId: "ch1",
    bet: 100,
    rounds: 1,
    currentRound: 1,
    challengerWins: 0,
    targetWins: 0,
    challengerChoice: null,
    targetChoice: null,
    status: "picking",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Pure function tests ──

Deno.test("resolveRps: rock beats scissors", () => {
  const session = makeSession({ challengerChoice: "rock", targetChoice: "scissors" });
  const result = resolveRps(session);
  assertEquals(result.draw, false);
  assertEquals(result.winnerId, "u1");
  assertEquals(result.loserId, "u2");
  assert(result.winnerPayout > 0);
});

Deno.test("resolveRps: scissors beats paper", () => {
  const session = makeSession({ challengerChoice: "scissors", targetChoice: "paper" });
  const result = resolveRps(session);
  assertEquals(result.winnerId, "u1");
});

Deno.test("resolveRps: paper beats rock", () => {
  const session = makeSession({ challengerChoice: "paper", targetChoice: "rock" });
  const result = resolveRps(session);
  assertEquals(result.winnerId, "u1");
});

Deno.test("resolveRps: target wins when target has better choice", () => {
  const session = makeSession({ challengerChoice: "rock", targetChoice: "paper" });
  const result = resolveRps(session);
  assertEquals(result.winnerId, "u2");
  assertEquals(result.loserId, "u1");
});

Deno.test("resolveRps: same choice is draw", () => {
  const session = makeSession({ challengerChoice: "rock", targetChoice: "rock" });
  const result = resolveRps(session);
  assertEquals(result.draw, true);
  assertEquals(result.winnerId, null);
  assertEquals(result.winnerPayout, 0);
});

Deno.test("resolveRps: payout has 5% house cut", () => {
  const session = makeSession({ bet: 1000, challengerChoice: "rock", targetChoice: "scissors" });
  const result = resolveRps(session);
  assertEquals(result.winnerPayout, Math.floor(1000 * 2 * 0.95));
});

Deno.test("choiceEmoji: returns emoji for each choice", () => {
  assert(choiceEmoji("rock").includes("rock"));
  assert(choiceEmoji("paper").length > 0);
  assert(choiceEmoji("scissors").includes("scissors"));
});

// ── Session tests ──

Deno.test("session: create and retrieve", async () => {
  resetStore();
  const session = await rps.createSession("g1", "u1", "u2", "ch1", 100, 3);
  assertEquals(session.guildId, "g1");
  assertEquals(session.rounds, 3);
  assertEquals(session.status, "pending");

  const retrieved = await rps.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.targetId, "u2");
});

Deno.test("session: update persists changes", async () => {
  resetStore();
  const session = await rps.createSession("g1", "u1", "u2", "ch1", 100, 1);
  session.status = "picking";
  session.challengerChoice = "rock";
  await rps.updateSession(session);

  const retrieved = await rps.getSession("g1", "u1");
  assertEquals(retrieved!.status, "picking");
  assertEquals(retrieved!.challengerChoice, "rock");
});

Deno.test("session: delete removes session", async () => {
  resetStore();
  await rps.createSession("g1", "u1", "u2", "ch1", 100, 1);
  await rps.deleteSession("g1", "u1");
  const retrieved = await rps.getSession("g1", "u1");
  assertEquals(retrieved, null);
});

Deno.test("session: expired session returns null", async () => {
  resetStore();
  const session = await rps.createSession("g1", "u1", "u2", "ch1", 100, 1);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await rps.updateSession(session);

  const retrieved = await rps.getSession("g1", "u1");
  assertEquals(retrieved, null);
});

Deno.test("BEATS map is consistent", () => {
  const { BEATS } = _internals;
  assertEquals(BEATS.rock, "scissors");
  assertEquals(BEATS.paper, "rock");
  assertEquals(BEATS.scissors, "paper");
});
