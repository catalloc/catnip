import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { russianRoulette, pullTrigger, calculateSurvivorPayout, _internals } from "./russian-roulette.ts";
import type { RussianRouletteSession } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeSession(overrides: Partial<RussianRouletteSession> = {}): RussianRouletteSession {
  return {
    guildId: "g1",
    hostId: "u1",
    channelId: "ch1",
    bet: 100,
    players: ["u1", "u2", "u3"],
    alivePlayers: ["u1", "u2", "u3"],
    currentTurn: 0,
    loadedChamber: 0,
    status: "playing",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Pure function tests ──

Deno.test("pullTrigger: returns fired or safe result", () => {
  const session = makeSession({ loadedChamber: 0 });
  // Run many times — eventually both paths should be hit
  let firedCount = 0;
  let safeCount = 0;
  for (let i = 0; i < 100; i++) {
    const result = pullTrigger(session);
    if (result.fired) firedCount++;
    else safeCount++;
  }
  // With 6 chambers, roughly 1/6 should fire
  assert(firedCount > 0, "Should fire at least once in 100 tries");
  assert(safeCount > 0, "Should be safe at least once in 100 tries");
});

Deno.test("pullTrigger: safe result advances to next player", () => {
  const session = makeSession({ currentTurn: 0, alivePlayers: ["u1", "u2", "u3"] });
  // Force a safe result by trying many times
  let found = false;
  for (let i = 0; i < 100; i++) {
    const result = pullTrigger(session);
    if (!result.fired) {
      assertEquals(result.nextPlayerId, "u2"); // next after u1
      assertEquals(result.eliminatedId, null);
      found = true;
      break;
    }
  }
  assert(found, "Should find at least one safe pull");
});

Deno.test("pullTrigger: fired result has eliminatedId", () => {
  const session = makeSession({ currentTurn: 1, alivePlayers: ["u1", "u2", "u3"] });
  let found = false;
  for (let i = 0; i < 100; i++) {
    const result = pullTrigger(session);
    if (result.fired) {
      assertEquals(result.eliminatedId, "u2"); // currentTurn=1 => u2
      found = true;
      break;
    }
  }
  assert(found, "Should fire at least once in 100 tries");
});

Deno.test("calculateSurvivorPayout: splits pot with house cut", () => {
  const payout = calculateSurvivorPayout(300, 2);
  assertEquals(payout, Math.floor(Math.floor(300 * 0.95) / 2));
});

Deno.test("calculateSurvivorPayout: single survivor gets full amount", () => {
  const payout = calculateSurvivorPayout(600, 1);
  assertEquals(payout, Math.floor(600 * 0.95));
});

// ── Session tests ──

Deno.test("session: create and retrieve", async () => {
  resetStore();
  const session = await russianRoulette.createSession("g1", "u1", "ch1", 100);
  assertEquals(session.players.length, 1);
  assertEquals(session.players[0], "u1");
  assertEquals(session.status, "lobby");

  const retrieved = await russianRoulette.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.bet, 100);
});

Deno.test("session: startGame requires min players", () => {
  const session = makeSession({ players: ["u1"], status: "lobby" });
  const started = russianRoulette.startGame(session);
  assertEquals(started, false);
});

Deno.test("session: startGame succeeds with 2+ players", () => {
  const session = makeSession({ players: ["u1", "u2"], alivePlayers: [], status: "lobby" });
  const started = russianRoulette.startGame(session);
  assertEquals(started, true);
  assertEquals(session.status, "playing");
  assertEquals(session.alivePlayers.length, 2);
});

Deno.test("session: update persists", async () => {
  resetStore();
  const session = await russianRoulette.createSession("g1", "u1", "ch1", 100);
  session.players.push("u2");
  await russianRoulette.updateSession(session);

  const retrieved = await russianRoulette.getSession("g1", "u1");
  assertEquals(retrieved!.players.length, 2);
});

Deno.test("session: delete removes", async () => {
  resetStore();
  await russianRoulette.createSession("g1", "u1", "ch1", 100);
  await russianRoulette.deleteSession("g1", "u1");
  assertEquals(await russianRoulette.getSession("g1", "u1"), null);
});

Deno.test("session: expired session returns null", async () => {
  resetStore();
  const session = await russianRoulette.createSession("g1", "u1", "ch1", 100);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await russianRoulette.updateSession(session);

  assertEquals(await russianRoulette.getSession("g1", "u1"), null);
});

Deno.test("constants: valid ranges", () => {
  assertEquals(_internals.MIN_PLAYERS, 2);
  assertEquals(_internals.MAX_PLAYERS, 6);
  assertEquals(_internals.CHAMBERS, 6);
  assert(_internals.SESSION_TTL_MS > 0);
});
