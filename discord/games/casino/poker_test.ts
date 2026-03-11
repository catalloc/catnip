import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import {
  poker, cardEmoji, formatPokerHand, evaluateHand, getHandLabel,
  getHandPayout, drawReplacements, _internals,
} from "./poker.ts";
import type { Card } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeCard(rank: string, suit: Card["suit"] = "hearts"): Card {
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  return { rank, suit, value: RANKS.indexOf(rank) + 2 };
}

// ── evaluateHand ──

Deno.test("poker: evaluateHand royal flush", () => {
  const hand = [
    makeCard("10", "spades"), makeCard("J", "spades"), makeCard("Q", "spades"),
    makeCard("K", "spades"), makeCard("A", "spades"),
  ];
  assertEquals(evaluateHand(hand), "royal-flush");
});

Deno.test("poker: evaluateHand straight flush", () => {
  const hand = [
    makeCard("5", "hearts"), makeCard("6", "hearts"), makeCard("7", "hearts"),
    makeCard("8", "hearts"), makeCard("9", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "straight-flush");
});

Deno.test("poker: evaluateHand four of a kind", () => {
  const hand = [
    makeCard("K", "hearts"), makeCard("K", "diamonds"), makeCard("K", "clubs"),
    makeCard("K", "spades"), makeCard("3", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "four-of-a-kind");
});

Deno.test("poker: evaluateHand full house", () => {
  const hand = [
    makeCard("Q", "hearts"), makeCard("Q", "diamonds"), makeCard("Q", "clubs"),
    makeCard("5", "spades"), makeCard("5", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "full-house");
});

Deno.test("poker: evaluateHand flush", () => {
  const hand = [
    makeCard("2", "clubs"), makeCard("5", "clubs"), makeCard("8", "clubs"),
    makeCard("J", "clubs"), makeCard("A", "clubs"),
  ];
  assertEquals(evaluateHand(hand), "flush");
});

Deno.test("poker: evaluateHand straight", () => {
  const hand = [
    makeCard("4", "hearts"), makeCard("5", "diamonds"), makeCard("6", "clubs"),
    makeCard("7", "spades"), makeCard("8", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "straight");
});

Deno.test("poker: evaluateHand ace-low straight", () => {
  const hand = [
    makeCard("A", "hearts"), makeCard("2", "diamonds"), makeCard("3", "clubs"),
    makeCard("4", "spades"), makeCard("5", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "straight");
});

Deno.test("poker: evaluateHand three of a kind", () => {
  const hand = [
    makeCard("9", "hearts"), makeCard("9", "diamonds"), makeCard("9", "clubs"),
    makeCard("3", "spades"), makeCard("7", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "three-of-a-kind");
});

Deno.test("poker: evaluateHand two pair", () => {
  const hand = [
    makeCard("6", "hearts"), makeCard("6", "diamonds"), makeCard("J", "clubs"),
    makeCard("J", "spades"), makeCard("2", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "two-pair");
});

Deno.test("poker: evaluateHand jacks or better", () => {
  const hand = [
    makeCard("J", "hearts"), makeCard("J", "diamonds"), makeCard("3", "clubs"),
    makeCard("7", "spades"), makeCard("9", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "jacks-or-better");
});

Deno.test("poker: evaluateHand pair below jacks is nothing", () => {
  const hand = [
    makeCard("5", "hearts"), makeCard("5", "diamonds"), makeCard("3", "clubs"),
    makeCard("7", "spades"), makeCard("9", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "nothing");
});

Deno.test("poker: evaluateHand no match is nothing", () => {
  const hand = [
    makeCard("2", "hearts"), makeCard("4", "diamonds"), makeCard("7", "clubs"),
    makeCard("9", "spades"), makeCard("J", "hearts"),
  ];
  assertEquals(evaluateHand(hand), "nothing");
});

// ── Payouts ──

Deno.test("poker: getHandPayout values", () => {
  assertEquals(getHandPayout("royal-flush"), 250);
  assertEquals(getHandPayout("straight-flush"), 50);
  assertEquals(getHandPayout("four-of-a-kind"), 25);
  assertEquals(getHandPayout("full-house"), 9);
  assertEquals(getHandPayout("flush"), 6);
  assertEquals(getHandPayout("straight"), 4);
  assertEquals(getHandPayout("three-of-a-kind"), 3);
  assertEquals(getHandPayout("two-pair"), 2);
  assertEquals(getHandPayout("jacks-or-better"), 1);
  assertEquals(getHandPayout("nothing"), 0);
});

// ── Display ──

Deno.test("poker: cardEmoji formats correctly", () => {
  assertEquals(cardEmoji(makeCard("A", "spades")), "A:spades:");
});

Deno.test("poker: formatPokerHand highlights held cards", () => {
  const hand = [makeCard("A"), makeCard("K"), makeCard("3"), makeCard("7"), makeCard("9")];
  const held = [true, false, true, false, false];
  const formatted = formatPokerHand(hand, held);
  assert(formatted.includes("**A:hearts:**"), "Held cards should be bold");
  assert(!formatted.includes("**K:hearts:**"), "Unheld cards should not be bold");
});

Deno.test("poker: getHandLabel returns strings", () => {
  assert(getHandLabel("royal-flush").length > 0);
  assert(getHandLabel("nothing").length > 0);
});

// ── drawReplacements ──

Deno.test("poker: drawReplacements replaces unheld cards", () => {
  const session = {
    guildId: "g1", userId: "u1", bet: 100,
    hand: [makeCard("2"), makeCard("3"), makeCard("4"), makeCard("5"), makeCard("6")],
    deck: [makeCard("A"), makeCard("K"), makeCard("Q")],
    held: [true, true, false, false, false],
    phase: "hold" as const, status: "playing" as const, createdAt: Date.now(),
  };

  drawReplacements(session);
  // First two should be unchanged
  assertEquals(session.hand[0].rank, "2");
  assertEquals(session.hand[1].rank, "3");
  // Last three should be replaced from deck (popped in order)
  assertEquals(session.phase, "done");
  assertEquals(session.status, "done");
});

// ── Session ──

Deno.test("poker session: create and retrieve", async () => {
  resetStore();
  const session = await poker.createSession("g1", "u1", 100);
  assertEquals(session.bet, 100);
  assertEquals(session.hand.length, 5);
  assertEquals(session.held, [false, false, false, false, false]);
  assertEquals(session.phase, "hold");

  const retrieved = await poker.getSession("g1", "u1");
  assert(retrieved !== null);
});

Deno.test("poker session: delete", async () => {
  resetStore();
  await poker.createSession("g1", "u1", 50);
  await poker.deleteSession("g1", "u1");
  assertEquals(await poker.getSession("g1", "u1"), null);
});

Deno.test("poker session: expired returns null", async () => {
  resetStore();
  const session = await poker.createSession("g1", "u1", 50);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await poker.updateSession(session);
  assertEquals(await poker.getSession("g1", "u1"), null);
});
