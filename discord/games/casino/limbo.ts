/**
 * discord/games/casino/limbo.ts
 *
 * Limbo — pick a target multiplier, win if the random roll meets it.
 * Higher target = higher risk/reward.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

export interface LimboResult {
  target: number;
  rolled: number;
  won: boolean;
  payout: number;
}

/**
 * Generate a random multiplier with 1% house edge.
 * Distribution: most rolls are low, high rolls are rare.
 */
function rollMultiplier(): number {
  // Uniform random in (0, 1) with granularity of 1/10000
  const r = (secureRandomIndex(10000) + 1) / 10001;
  // Result with 1% house edge, capped at 100x
  return Math.min(100, Math.floor((0.99 / r) * 100) / 100);
}

export function playLimbo(bet: number, target: number): LimboResult {
  const rolled = rollMultiplier();
  const won = rolled >= target;
  const payout = won ? Math.floor(bet * target) : 0;
  return { target, rolled, won, payout };
}
