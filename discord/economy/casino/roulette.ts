/**
 * discord/economy/casino/roulette.ts
 *
 * Roulette — red/black (2x) or exact number (36x).
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBetType = "red" | "black" | "number";

export interface RouletteResult {
  betType: RouletteBetType;
  betValue: string;
  landed: number;
  landedColor: "red" | "black" | "green";
  won: boolean;
  payout: number;
}

export function playRoulette(bet: number, betType: RouletteBetType, betValue: number): RouletteResult {
  const landed = secureRandomIndex(37); // 0-36
  const landedColor: "red" | "black" | "green" = landed === 0 ? "green" : RED_NUMBERS.has(landed) ? "red" : "black";

  let won = false;
  let payout = 0;

  if (betType === "number") {
    won = landed === betValue;
    payout = won ? bet * 36 : 0;
  } else {
    won = landedColor === betType;
    payout = won ? bet * 2 : 0;
  }

  return {
    betType,
    betValue: betType === "number" ? String(betValue) : betType,
    landed,
    landedColor,
    won,
    payout,
  };
}
