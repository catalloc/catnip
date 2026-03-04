/**
 * discord/economy/casino/dice.ts
 *
 * Dice game — pick a number 1-6, 5x payout.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

export interface DiceResult {
  choice: number;
  rolled: number;
  won: boolean;
  payout: number;
}

export function playDice(bet: number, choice: number): DiceResult {
  const rolled = secureRandomIndex(6) + 1;
  const won = choice === rolled;
  return { choice, rolled, won, payout: won ? bet * 5 : 0 };
}
