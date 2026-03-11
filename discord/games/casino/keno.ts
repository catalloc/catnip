/**
 * discord/games/casino/keno.ts
 *
 * Keno — pick 1-10 numbers from 1-40, 10 are drawn. Payout by matches.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

export const KENO_POOL = 40;
export const KENO_DRAW_COUNT = 10;
export const KENO_MAX_PICKS = 10;

// Pay table: PAYOUTS[picks][hits] = multiplier
const PAYOUTS: Record<number, Record<number, number>> = {
  1:  { 0: 0, 1: 3.5 },
  2:  { 0: 0, 1: 1, 2: 8 },
  3:  { 0: 0, 1: 0, 2: 2, 3: 25 },
  4:  { 0: 0, 1: 0, 2: 1.5, 3: 5, 4: 50 },
  5:  { 0: 0, 1: 0, 2: 1, 3: 3, 4: 15, 5: 100 },
  6:  { 0: 0, 1: 0, 2: 0, 3: 2, 4: 8, 5: 50, 6: 200 },
  7:  { 0: 0, 1: 0, 2: 0, 3: 1.5, 4: 5, 5: 20, 6: 100, 7: 500 },
  8:  { 0: 0, 1: 0, 2: 0, 3: 1, 4: 3, 5: 10, 6: 50, 7: 250, 8: 1000 },
  9:  { 0: 0, 1: 0, 2: 0, 3: 0, 4: 2, 5: 5, 6: 25, 7: 100, 8: 500, 9: 2000 },
  10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1.5, 5: 3, 6: 15, 7: 50, 8: 250, 9: 1000, 10: 5000 },
};

export interface KenoResult {
  picks: number[];
  drawn: number[];
  hits: number[];
  hitCount: number;
  multiplier: number;
  won: boolean;
  payout: number;
}

/**
 * Draw `count` unique numbers from 1 to `pool`.
 */
function drawNumbers(pool: number, count: number): number[] {
  if (count > pool) count = pool;
  const available = Array.from({ length: pool }, (_, i) => i + 1);
  const drawn: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = secureRandomIndex(available.length);
    drawn.push(available[idx]);
    available.splice(idx, 1);
  }
  return drawn.sort((a, b) => a - b);
}

export function getMultiplier(pickCount: number, hitCount: number): number {
  return PAYOUTS[pickCount]?.[hitCount] ?? 0;
}

export function playKeno(bet: number, picks: number[]): KenoResult {
  const drawn = drawNumbers(KENO_POOL, KENO_DRAW_COUNT);
  const drawnSet = new Set(drawn);
  const hits = picks.filter((n) => drawnSet.has(n)).sort((a, b) => a - b);
  const hitCount = hits.length;
  const multiplier = getMultiplier(picks.length, hitCount);
  const payout = Math.floor(bet * multiplier);

  return { picks: [...picks].sort((a, b) => a - b), drawn, hits, hitCount, multiplier, won: payout > 0, payout };
}

export function parseKenoNumbers(input: string): { numbers: number[]; error?: string } {
  const parts = input.split(/[,\s]+/).filter(Boolean);
  const numbers: number[] = [];
  const seen = new Set<number>();

  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 1 || n > KENO_POOL) {
      return { numbers: [], error: `Invalid number: "${part}". Must be 1-${KENO_POOL}.` };
    }
    if (seen.has(n)) {
      return { numbers: [], error: `Duplicate number: ${n}.` };
    }
    seen.add(n);
    numbers.push(n);
  }

  if (numbers.length < 1 || numbers.length > KENO_MAX_PICKS) {
    return { numbers: [], error: `Pick 1-${KENO_MAX_PICKS} numbers.` };
  }

  return { numbers };
}
