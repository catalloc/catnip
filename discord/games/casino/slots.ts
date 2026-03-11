/**
 * discord/economy/casino/slots.ts
 *
 * Slot machine — 3 reels, match symbols for payouts.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

const SYMBOLS = [
  { emoji: ":cherries:", weight: 30 },
  { emoji: ":lemon:", weight: 25 },
  { emoji: ":tangerine:", weight: 20 },
  { emoji: ":grapes:", weight: 15 },
  { emoji: ":bell:", weight: 7 },
  { emoji: ":seven:", weight: 3 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function spinReel(): string {
  let roll = secureRandomIndex(TOTAL_WEIGHT);
  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll < 0) return symbol.emoji;
  }
  return SYMBOLS[0].emoji;
}

function getMultiplier(reels: string[]): number {
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    // Three of a kind
    if (reels[0] === ":seven:") return 25;
    if (reels[0] === ":bell:") return 10;
    if (reels[0] === ":grapes:") return 5;
    if (reels[0] === ":tangerine:") return 3;
    if (reels[0] === ":lemon:") return 2;
    return 1.5; // cherries
  }
  if (reels[0] === reels[1] || reels[1] === reels[2]) {
    return 1.5; // two adjacent match
  }
  return 0;
}

export interface SlotsResult {
  reels: string[];
  multiplier: number;
  won: boolean;
  payout: number;
}

export function playSlots(bet: number): SlotsResult {
  const reels = [spinReel(), spinReel(), spinReel()];
  const multiplier = getMultiplier(reels);
  const payout = Math.floor(bet * multiplier);
  return { reels, multiplier, won: payout > 0, payout };
}
