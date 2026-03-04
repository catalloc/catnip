/**
 * discord/economy/casino/coinflip.ts
 *
 * Coin flip game — call heads or tails, 2x payout.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

export type CoinSide = "heads" | "tails";

export interface CoinflipResult {
  choice: CoinSide;
  result: CoinSide;
  won: boolean;
  payout: number;
}

export function playCoinflip(bet: number, choice: CoinSide): CoinflipResult {
  const result: CoinSide = secureRandomIndex(2) === 0 ? "heads" : "tails";
  const won = choice === result;
  return { choice, result, won, payout: won ? bet * 2 : 0 };
}
