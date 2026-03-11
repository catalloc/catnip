/**
 * discord/games/casino/plinko.ts
 *
 * Plinko — ball drops through pegs, lands in a multiplier slot.
 * Pick a risk level: low, medium, or high.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

export type PlinkoRisk = "low" | "medium" | "high";

const ROWS = 8;

// Multiplier slots (9 slots for 8 rows of pegs)
const MULTIPLIERS: Record<PlinkoRisk, number[]> = {
  low:    [1.5, 1.2, 1.0, 0.5, 0.3, 0.5, 1.0, 1.2, 1.5],
  medium: [3.0, 1.5, 1.0, 0.5, 0.2, 0.5, 1.0, 1.5, 3.0],
  high:   [10.0, 3.0, 1.5, 0.5, 0.1, 0.5, 1.5, 3.0, 10.0],
};

export interface PlinkoResult {
  risk: PlinkoRisk;
  path: ("L" | "R")[];
  slot: number;
  multiplier: number;
  won: boolean;
  payout: number;
}

export function playPlinko(bet: number, risk: PlinkoRisk): PlinkoResult {
  const path: ("L" | "R")[] = [];
  let position = 0;

  for (let i = 0; i < ROWS; i++) {
    const goRight = secureRandomIndex(2) === 1;
    path.push(goRight ? "R" : "L");
    if (goRight) position++;
  }

  const slots = MULTIPLIERS[risk];
  const multiplier = slots[position];
  const payout = Math.floor(bet * multiplier);

  return { risk, path, slot: position, multiplier, won: payout > 0, payout };
}

export const _internals = { MULTIPLIERS, ROWS };
