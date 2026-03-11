/**
 * discord/games/casino/hilo.ts
 *
 * Hi-Lo — draw a card, guess if the next is higher or lower.
 * Chain correct guesses for increasing multiplier. Cash out anytime.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { Card, HiLoSession } from "../types.ts";

const SESSION_TTL_MS = 5 * 60 * 1000;
const SUITS: Card["suit"][] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

function sessionKey(guildId: string, userId: string): string {
  return `hilo:${guildId}:${userId}`;
}

function rankValue(rank: string): number {
  return RANKS.indexOf(rank) + 2; // 2-14
}

function drawRandomCard(): Card {
  const rankIdx = secureRandomIndex(13);
  const suitIdx = secureRandomIndex(4);
  const rank = RANKS[rankIdx];
  const value = rankIdx + 2;
  return { rank, suit: SUITS[suitIdx], value };
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

/**
 * Calculate step multiplier for a guess given the current card.
 * Based on probability of being correct with 3% house edge.
 */
export function stepMultiplier(currentRank: string, guess: "higher" | "lower"): number {
  const val = rankValue(currentRank);
  // Count favorable outcomes (out of 13 ranks)
  const favorable = guess === "higher" ? 14 - val : val - 2;
  if (favorable <= 0) return 0; // impossible guess
  const probability = favorable / 13;
  return Math.floor((0.97 / probability) * 100) / 100;
}

export type HiLoGuess = "higher" | "lower";

export interface HiLoGuessResult {
  correct: boolean;
  nextCard: Card;
  newMultiplier: number;
  stepMult: number;
}

/** Process a guess. Returns whether it was correct and the new state. */
export function processGuess(
  session: HiLoSession,
  guess: HiLoGuess,
): HiLoGuessResult {
  const nextCard = session.deck.pop() ?? drawRandomCard();
  const currentVal = rankValue(session.currentCard.rank);
  const nextVal = rankValue(nextCard.rank);

  let correct = false;
  if (guess === "higher" && nextVal > currentVal) correct = true;
  if (guess === "lower" && nextVal < currentVal) correct = true;
  // Tie (same rank) = loss

  const stepMult = stepMultiplier(session.currentCard.rank, guess);
  const newMultiplier = correct
    ? Math.floor(session.currentMultiplier * stepMult * 100) / 100
    : 0;

  if (correct) {
    session.currentCard = nextCard;
    session.streak++;
    session.currentMultiplier = newMultiplier;
  }

  return { correct, nextCard, newMultiplier, stepMult };
}

/** Build a simple shuffled deck. */
function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      deck.push({ rank: RANKS[i], suit, value: i + 2 });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const hilo = {
  async getSession(guildId: string, userId: string): Promise<HiLoSession | null> {
    const session = await kv.get<HiLoSession>(sessionKey(guildId, userId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, userId));
      return null;
    }
    return session;
  },

  async createSession(guildId: string, userId: string, bet: number): Promise<HiLoSession> {
    const deck = buildDeck();
    const currentCard = deck.pop()!;

    const session: HiLoSession = {
      guildId,
      userId,
      bet,
      currentCard,
      deck,
      streak: 0,
      currentMultiplier: 1.0,
      status: "playing",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: HiLoSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, userId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS, rankValue, buildDeck };
