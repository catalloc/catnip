import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import {
  createDeck, shuffleDeck, handValue, isBlackjack, isBust,
  cardEmoji, formatHand, dealerShouldHit, determineOutcome,
  calculatePayout, blackjack, _internals,
} from "./blackjack.ts";
import type { Card, BlackjackSession } from "../types.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeCard(rank: string, suit: Card["suit"] = "hearts"): Card {
  const value = rank === "A" ? 11 : ["J", "Q", "K"].includes(rank) ? 10 : parseInt(rank);
  return { rank, suit, value };
}

Deno.test("createDeck: has 52 cards", () => {
  const deck = createDeck();
  assertEquals(deck.length, 52);
});

Deno.test("shuffleDeck: has same cards", () => {
  const deck = createDeck();
  const shuffled = shuffleDeck(deck);
  assertEquals(shuffled.length, 52);
});

Deno.test("handValue: simple hand", () => {
  assertEquals(handValue([makeCard("5"), makeCard("8")]), 13);
});

Deno.test("handValue: ace counts as 11", () => {
  assertEquals(handValue([makeCard("A"), makeCard("8")]), 19);
});

Deno.test("handValue: ace counts as 1 to avoid bust", () => {
  assertEquals(handValue([makeCard("A"), makeCard("8"), makeCard("5")]), 14);
});

Deno.test("handValue: two aces", () => {
  assertEquals(handValue([makeCard("A"), makeCard("A")]), 12);
});

Deno.test("isBlackjack: ace and face card", () => {
  assertEquals(isBlackjack([makeCard("A"), makeCard("K")]), true);
});

Deno.test("isBlackjack: non-blackjack 21", () => {
  assertEquals(isBlackjack([makeCard("7"), makeCard("7"), makeCard("7")]), false);
});

Deno.test("isBust: over 21", () => {
  assertEquals(isBust([makeCard("K"), makeCard("Q"), makeCard("5")]), true);
});

Deno.test("isBust: exactly 21", () => {
  assertEquals(isBust([makeCard("K"), makeCard("A")]), false);
});

Deno.test("cardEmoji: formats correctly", () => {
  assertEquals(cardEmoji(makeCard("A", "spades")), "A:spades:");
});

Deno.test("formatHand: shows all cards", () => {
  const hand = [makeCard("A", "hearts"), makeCard("K", "spades")];
  const formatted = formatHand(hand);
  assert(formatted.includes("A:hearts:"));
  assert(formatted.includes("K:spades:"));
});

Deno.test("formatHand: hides second card", () => {
  const hand = [makeCard("A"), makeCard("K")];
  const formatted = formatHand(hand, true);
  assert(formatted.includes("A:hearts:"));
  assert(formatted.includes(":question:"));
  assert(!formatted.includes("K"));
});

Deno.test("dealerShouldHit: hits on 16", () => {
  assertEquals(dealerShouldHit([makeCard("10"), makeCard("6")]), true);
});

Deno.test("dealerShouldHit: stands on 17", () => {
  assertEquals(dealerShouldHit([makeCard("10"), makeCard("7")]), false);
});

Deno.test("determineOutcome: player bust", () => {
  const session = { playerHand: [makeCard("K"), makeCard("Q"), makeCard("5")], dealerHand: [makeCard("10"), makeCard("7")] } as any;
  assertEquals(determineOutcome(session), "player-bust");
});

Deno.test("determineOutcome: player blackjack", () => {
  const session = { playerHand: [makeCard("A"), makeCard("K")], dealerHand: [makeCard("10"), makeCard("7")] } as any;
  assertEquals(determineOutcome(session), "player-blackjack");
});

Deno.test("determineOutcome: push", () => {
  const session = { playerHand: [makeCard("10"), makeCard("8")], dealerHand: [makeCard("10"), makeCard("8")] } as any;
  assertEquals(determineOutcome(session), "push");
});

Deno.test("calculatePayout: blackjack 2.5x", () => {
  assertEquals(calculatePayout(100, "player-blackjack"), 250);
});

Deno.test("calculatePayout: win 2x", () => {
  assertEquals(calculatePayout(100, "player-win"), 200);
});

Deno.test("calculatePayout: push returns bet", () => {
  assertEquals(calculatePayout(100, "push"), 100);
});

Deno.test("calculatePayout: loss 0", () => {
  assertEquals(calculatePayout(100, "dealer-win"), 0);
});

Deno.test("blackjack session: create and retrieve", async () => {
  resetStore();
  const session = await blackjack.createSession("g1", "u1", "ch1", "msg1", 100);
  assertEquals(session.bet, 100);
  assertEquals(session.playerHand.length, 2);
  assertEquals(session.dealerHand.length, 2);
  assertEquals(session.status, "playing");
  const retrieved = await blackjack.getSession("g1", "u1");
  assert(retrieved);
  assertEquals(retrieved!.bet, 100);
});

Deno.test("blackjack session: delete", async () => {
  resetStore();
  await blackjack.createSession("g1", "u1", "ch1", "msg1", 50);
  await blackjack.deleteSession("g1", "u1");
  const session = await blackjack.getSession("g1", "u1");
  assertEquals(session, null);
});

Deno.test("blackjack session: expired session returns null", async () => {
  resetStore();
  const session = await blackjack.createSession("g1", "u1", "ch1", "msg1", 50);
  // Manually expire by manipulating createdAt
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await blackjack.updateSession(session);
  const retrieved = await blackjack.getSession("g1", "u1");
  assertEquals(retrieved, null);
});

// --- playDealerHand ---

import { playDealerHand } from "./blackjack.ts";

Deno.test("playDealerHand: hits until >= 17 then stops", () => {
  const session = {
    dealerHand: [makeCard("2"), makeCard("3")], // value = 5
    deck: [makeCard("4"), makeCard("5"), makeCard("6"), makeCard("K")],
  } as any;
  const result = playDealerHand(session);
  assert(handValue(result.dealerHand) >= 17);
});

// --- determineOutcome: dealer bust ---

Deno.test("determineOutcome: dealer bust", () => {
  const session = {
    playerHand: [makeCard("10"), makeCard("8")], // 18
    dealerHand: [makeCard("K"), makeCard("Q"), makeCard("5")], // 25 (bust)
  } as any;
  assertEquals(determineOutcome(session), "dealer-bust");
});

// --- determineOutcome: player wins (higher value) ---

Deno.test("determineOutcome: player wins with higher value", () => {
  const session = {
    playerHand: [makeCard("10"), makeCard("9")], // 19
    dealerHand: [makeCard("10"), makeCard("8")], // 18
  } as any;
  assertEquals(determineOutcome(session), "player-win");
});

// --- determineOutcome: dealer wins ---

Deno.test("determineOutcome: dealer wins with higher value", () => {
  const session = {
    playerHand: [makeCard("10"), makeCard("7")], // 17
    dealerHand: [makeCard("10"), makeCard("9")], // 19
  } as any;
  assertEquals(determineOutcome(session), "dealer-win");
});

// --- updateSession persists and retrieves ---

Deno.test("blackjack session: updateSession persists changes", async () => {
  resetStore();
  const session = await blackjack.createSession("g1", "u_upd", "ch1", "msg1", 100);
  session.status = "standing";
  await blackjack.updateSession(session);
  const retrieved = await blackjack.getSession("g1", "u_upd");
  assert(retrieved);
  assertEquals(retrieved!.status, "standing");
});
