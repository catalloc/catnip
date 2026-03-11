import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { hilo, cardEmoji, stepMultiplier, processGuess, _internals } from "./hilo.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("hilo: stepMultiplier for middle card", () => {
  const mult = stepMultiplier("7", "higher");
  assert(mult > 1.0, "Higher on 7 should be > 1.0");
  assert(mult < 3.0, "Higher on 7 should be < 3.0");
});

Deno.test("hilo: stepMultiplier for low card higher is low", () => {
  const mult = stepMultiplier("2", "higher");
  assert(mult > 0 && mult < 1.5, `Higher on 2 should be easy/low multiplier: ${mult}`);
});

Deno.test("hilo: stepMultiplier for high card lower is low", () => {
  const mult = stepMultiplier("A", "lower");
  assert(mult > 0 && mult < 1.5, `Lower on A should be easy/low multiplier: ${mult}`);
});

Deno.test("hilo: stepMultiplier for A higher is very high", () => {
  // A is rank 14, higher means next rank > 14, which is impossible
  const mult = stepMultiplier("A", "higher");
  assertEquals(mult, 0, "Higher on A should be impossible (0)");
});

Deno.test("hilo: stepMultiplier for 2 lower is impossible", () => {
  const mult = stepMultiplier("2", "lower");
  assertEquals(mult, 0, "Lower on 2 should be impossible (0)");
});

Deno.test("hilo: cardEmoji formats correctly", () => {
  const card = { rank: "A", suit: "spades" as const, value: 14 };
  assertEquals(cardEmoji(card), "A:spades:");
});

Deno.test("hilo: processGuess correct higher", () => {
  const session = {
    guildId: "g1", userId: "u1", bet: 100,
    currentCard: { rank: "5", suit: "hearts" as const, value: 7 },
    deck: [{ rank: "K", suit: "spades" as const, value: 13 }],
    streak: 0, currentMultiplier: 1.0,
    status: "playing" as const, createdAt: Date.now(),
  };
  const result = processGuess(session, "higher");
  // K (13) > 5 (7), so correct
  assert(result.correct);
  assertEquals(session.streak, 1);
  assert(session.currentMultiplier > 1.0);
});

Deno.test("hilo: processGuess wrong higher", () => {
  const session = {
    guildId: "g1", userId: "u1", bet: 100,
    currentCard: { rank: "K", suit: "hearts" as const, value: 13 },
    deck: [{ rank: "3", suit: "spades" as const, value: 5 }],
    streak: 2, currentMultiplier: 3.0,
    status: "playing" as const, createdAt: Date.now(),
  };
  const result = processGuess(session, "higher");
  assert(!result.correct);
  // Streak should not change (processGuess doesn't reset it)
  assertEquals(session.streak, 2);
});

Deno.test("hilo: processGuess tie is loss", () => {
  const session = {
    guildId: "g1", userId: "u1", bet: 100,
    currentCard: { rank: "7", suit: "hearts" as const, value: 9 },
    deck: [{ rank: "7", suit: "spades" as const, value: 9 }],
    streak: 0, currentMultiplier: 1.0,
    status: "playing" as const, createdAt: Date.now(),
  };
  const result = processGuess(session, "higher");
  assert(!result.correct, "Tie should be a loss");
});

Deno.test("hilo session: create and retrieve", async () => {
  resetStore();
  const session = await hilo.createSession("g1", "u1", 100);
  assertEquals(session.bet, 100);
  assertEquals(session.streak, 0);
  assert(session.currentCard !== undefined);
  assert(session.deck.length > 0);

  const retrieved = await hilo.getSession("g1", "u1");
  assert(retrieved !== null);
});

Deno.test("hilo session: delete", async () => {
  resetStore();
  await hilo.createSession("g1", "u1", 50);
  await hilo.deleteSession("g1", "u1");
  assertEquals(await hilo.getSession("g1", "u1"), null);
});

Deno.test("hilo session: expired returns null", async () => {
  resetStore();
  const session = await hilo.createSession("g1", "u1", 50);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await hilo.updateSession(session);
  assertEquals(await hilo.getSession("g1", "u1"), null);
});
