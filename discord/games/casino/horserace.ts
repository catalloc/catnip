/**
 * discord/games/casino/horserace.ts
 *
 * Horse Race — pick a horse, watch it race, win based on odds.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

export interface Horse {
  number: number;
  name: string;
  emoji: string;
  weight: number;
  payout: number;
}

export const HORSES: Horse[] = [
  { number: 1, name: "Thunder", emoji: ":horse:", weight: 35, payout: 2.5 },
  { number: 2, name: "Lightning", emoji: ":racehorse:", weight: 25, payout: 3.5 },
  { number: 3, name: "Storm", emoji: ":horse:", weight: 20, payout: 4.5 },
  { number: 4, name: "Blaze", emoji: ":racehorse:", weight: 13, payout: 7 },
  { number: 5, name: "Shadow", emoji: ":horse:", weight: 7, payout: 13 },
];

const TOTAL_WEIGHT = HORSES.reduce((sum, h) => sum + h.weight, 0);
const TRACK_LENGTH = 10;

export interface HorseRaceResult {
  chosenHorse: number;
  winner: Horse;
  positions: number[][];
  won: boolean;
  payout: number;
}

function pickWinner(): Horse {
  let roll = secureRandomIndex(TOTAL_WEIGHT);
  for (const horse of HORSES) {
    roll -= horse.weight;
    if (roll < 0) return horse;
  }
  return HORSES[0];
}

/**
 * Generate race positions for display.
 * The winner reaches TRACK_LENGTH first; others trail behind.
 */
function simulateRace(winner: Horse): number[][] {
  const positions: number[][] = [];
  const current = HORSES.map(() => 0);

  for (let step = 0; step < TRACK_LENGTH; step++) {
    for (let i = 0; i < HORSES.length; i++) {
      if (HORSES[i].number === winner.number) {
        current[i]++;
      } else {
        // Other horses advance randomly but slower
        if (secureRandomIndex(3) > 0) current[i]++;
        current[i] = Math.min(current[i], step); // can't pass winner
      }
    }
    positions.push([...current]);
  }

  return positions;
}

export function formatRace(positions: number[]): string {
  return HORSES.map((horse, i) => {
    const pos = positions[i];
    const track = "░".repeat(pos) + horse.emoji + "░".repeat(Math.max(0, TRACK_LENGTH - pos));
    return `\`${horse.number}\` ${track}`;
  }).join("\n");
}

export function playHorseRace(bet: number, chosenHorse: number): HorseRaceResult {
  const winner = pickWinner();
  const positions = simulateRace(winner);
  const won = chosenHorse === winner.number;
  const horse = HORSES.find((h) => h.number === chosenHorse)!;
  const payout = won ? Math.floor(bet * horse.payout) : 0;

  return { chosenHorse, winner, positions, won, payout };
}

export const _internals = { TOTAL_WEIGHT, TRACK_LENGTH, pickWinner };
