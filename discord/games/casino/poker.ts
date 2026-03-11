/**
 * discord/games/casino/poker.ts
 *
 * Video Poker (Jacks or Better) — deal 5 cards, hold/discard, draw, payout.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { Card, PokerSession } from "../types.ts";

const SESSION_TTL_MS = 5 * 60 * 1000;
const SUITS: Card["suit"][] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function sessionKey(guildId: string, userId: string): string {
  return `poker:${guildId}:${userId}`;
}

const SUIT_MAP: Record<string, string> = {
  hearts: ":hearts:",
  diamonds: ":diamonds:",
  clubs: ":clubs:",
  spades: ":spades:",
};

export function cardEmoji(card: Card): string {
  return `${card.rank}${SUIT_MAP[card.suit]}`;
}

export function formatPokerHand(hand: Card[], held: boolean[]): string {
  return hand.map((c, i) => {
    const emoji = cardEmoji(c);
    return held[i] ? `**${emoji}**` : emoji;
  }).join(" ");
}

// ── Hand Evaluation ──────────────────────────────────────

export type PokerHandRank =
  | "royal-flush" | "straight-flush" | "four-of-a-kind"
  | "full-house" | "flush" | "straight" | "three-of-a-kind"
  | "two-pair" | "jacks-or-better" | "nothing";

const HAND_LABELS: Record<PokerHandRank, string> = {
  "royal-flush": "Royal Flush",
  "straight-flush": "Straight Flush",
  "four-of-a-kind": "Four of a Kind",
  "full-house": "Full House",
  "flush": "Flush",
  "straight": "Straight",
  "three-of-a-kind": "Three of a Kind",
  "two-pair": "Two Pair",
  "jacks-or-better": "Jacks or Better",
  "nothing": "Nothing",
};

const HAND_PAYOUTS: Record<PokerHandRank, number> = {
  "royal-flush": 250,
  "straight-flush": 50,
  "four-of-a-kind": 25,
  "full-house": 9,
  "flush": 6,
  "straight": 4,
  "three-of-a-kind": 3,
  "two-pair": 2,
  "jacks-or-better": 1,
  "nothing": 0,
};

function rankValue(rank: string): number {
  return RANKS.indexOf(rank);
}

export function evaluateHand(hand: Card[]): PokerHandRank {
  const values = hand.map((c) => rankValue(c.rank)).sort((a, b) => a - b);
  const suits = hand.map((c) => c.suit);

  // Check flush
  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight
  let isStraight = false;
  if (values[4] - values[0] === 4 && new Set(values).size === 5) {
    isStraight = true;
  }
  // Ace-low straight: A,2,3,4,5
  if (values[0] === 0 && values[1] === 1 && values[2] === 2 && values[3] === 3 && values[4] === 12) {
    isStraight = true;
  }

  // Count frequencies
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  const counts = [...freq.values()].sort((a, b) => b - a);

  // Royal flush
  if (isFlush && isStraight && values[0] === 8) return "royal-flush"; // 10,J,Q,K,A
  if (isFlush && isStraight) return "straight-flush";
  if (counts[0] === 4) return "four-of-a-kind";
  if (counts[0] === 3 && counts[1] === 2) return "full-house";
  if (isFlush) return "flush";
  if (isStraight) return "straight";
  if (counts[0] === 3) return "three-of-a-kind";
  if (counts[0] === 2 && counts[1] === 2) return "two-pair";

  // Jacks or better (pair of J, Q, K, or A)
  if (counts[0] === 2) {
    for (const [val, count] of freq) {
      if (count === 2 && val >= 9) return "jacks-or-better"; // J=9, Q=10, K=11, A=12
    }
  }

  return "nothing";
}

export function getHandLabel(rank: PokerHandRank): string {
  return HAND_LABELS[rank];
}

export function getHandPayout(rank: PokerHandRank): number {
  return HAND_PAYOUTS[rank];
}

// ── Deck & Session ───────────────────────────────────────

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      deck.push({ rank: RANKS[i], suit, value: i + 2 });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Replace unheld cards with new ones from the deck. */
export function drawReplacements(session: PokerSession): void {
  for (let i = 0; i < 5; i++) {
    if (!session.held[i]) {
      const newCard = session.deck.pop();
      if (newCard) session.hand[i] = newCard;
    }
  }
  session.phase = "done";
  session.status = "done";
}

export const poker = {
  async getSession(guildId: string, userId: string): Promise<PokerSession | null> {
    const session = await kv.get<PokerSession>(sessionKey(guildId, userId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, userId));
      return null;
    }
    return session;
  },

  async createSession(guildId: string, userId: string, bet: number): Promise<PokerSession> {
    const deck = buildDeck();
    const hand = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!];

    const session: PokerSession = {
      guildId,
      userId,
      bet,
      hand,
      deck,
      held: [false, false, false, false, false],
      phase: "hold",
      status: "playing",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: PokerSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, userId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS, rankValue, buildDeck };
