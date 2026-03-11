/**
 * discord/economy/casino/blackjack.ts
 *
 * Blackjack game logic — deck, hand scoring, game state management.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { Card, BlackjackSession } from "../types.ts";

const SUITS: Card["suit"][] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function sessionKey(guildId: string, userId: string): string {
  return `blackjack:${guildId}:${userId}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const value = rank === "A" ? 11
        : ["J", "Q", "K"].includes(rank) ? 10
        : parseInt(rank);
      deck.push({ suit, rank, value });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function handValue(hand: Card[]): number {
  let total = hand.reduce((sum, c) => sum + c.value, 0);
  let aces = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isBust(hand: Card[]): boolean {
  return handValue(hand) > 21;
}

export function cardEmoji(card: Card): string {
  const suitMap = { hearts: ":hearts:", diamonds: ":diamonds:", clubs: ":clubs:", spades: ":spades:" };
  return `${card.rank}${suitMap[card.suit]}`;
}

export function formatHand(hand: Card[], hideSecond = false): string {
  if (hideSecond && hand.length >= 2) {
    return `${cardEmoji(hand[0])} :question:`;
  }
  return hand.map(cardEmoji).join(" ");
}

export function dealerShouldHit(hand: Card[]): boolean {
  return handValue(hand) < 17;
}

export function playDealerHand(session: BlackjackSession): BlackjackSession {
  while (dealerShouldHit(session.dealerHand)) {
    const card = session.deck.pop();
    if (!card) break;
    session.dealerHand.push(card);
  }
  session.status = "done";
  return session;
}

export type BlackjackOutcome = "player-blackjack" | "player-win" | "dealer-win" | "push" | "player-bust" | "dealer-bust";

export function determineOutcome(session: BlackjackSession): BlackjackOutcome {
  const playerVal = handValue(session.playerHand);
  const dealerVal = handValue(session.dealerHand);

  if (playerVal > 21) return "player-bust";
  if (isBlackjack(session.playerHand) && !isBlackjack(session.dealerHand)) return "player-blackjack";
  if (dealerVal > 21) return "dealer-bust";
  if (playerVal > dealerVal) return "player-win";
  if (dealerVal > playerVal) return "dealer-win";
  return "push";
}

export function calculatePayout(bet: number, outcome: BlackjackOutcome): number {
  switch (outcome) {
    case "player-blackjack": return Math.floor(bet * 2.5);
    case "player-win":
    case "dealer-bust": return bet * 2;
    case "push": return bet;
    default: return 0;
  }
}

export const blackjack = {
  async getSession(guildId: string, userId: string): Promise<BlackjackSession | null> {
    const session = await kv.get<BlackjackSession>(sessionKey(guildId, userId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, userId));
      return null;
    }
    return session;
  },

  async createSession(
    guildId: string,
    userId: string,
    channelId: string,
    messageId: string,
    bet: number,
  ): Promise<BlackjackSession> {
    const deck = shuffleDeck(createDeck());
    const playerHand = [deck.pop()!, deck.pop()!];
    const dealerHand = [deck.pop()!, deck.pop()!];

    const session: BlackjackSession = {
      guildId, userId, channelId, messageId, bet,
      playerHand, dealerHand, deck,
      status: "playing",
      createdAt: Date.now(),
    };

    await kv.set(sessionKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: BlackjackSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, userId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS };
