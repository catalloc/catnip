/**
 * discord/games/casino/mines.ts
 *
 * Mines — 4x5 grid with hidden mines. Reveal safe cells for increasing
 * multiplier, or hit a mine and lose. Cash out anytime.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { MinesSession } from "../types.ts";

export const GRID_SIZE = 20; // 4 rows x 5 cols
export const MAX_MINES = 19;
const SESSION_TTL_MS = 5 * 60 * 1000;

function sessionKey(guildId: string, userId: string): string {
  return `mines:${guildId}:${userId}`;
}

/** Generate a grid with `mineCount` randomly placed mines. */
export function generateGrid(mineCount: number): boolean[] {
  const grid = new Array<boolean>(GRID_SIZE).fill(false);
  let placed = 0;
  while (placed < mineCount) {
    const idx = secureRandomIndex(GRID_SIZE);
    if (!grid[idx]) {
      grid[idx] = true;
      placed++;
    }
  }
  return grid;
}

/**
 * Calculate multiplier after `safePicks` safe picks with `mineCount` mines.
 * Based on probability: fair multiplier = C(total, picks) / C(safe, picks)
 * with 1% house edge.
 */
export function calculateMultiplier(mineCount: number, safePicks: number): number {
  if (safePicks === 0) return 1.0;
  const safeTotal = GRID_SIZE - mineCount;

  let probability = 1;
  for (let i = 0; i < safePicks; i++) {
    probability *= (safeTotal - i) / (GRID_SIZE - i);
  }

  const multiplier = 0.99 / probability;
  return Math.floor(multiplier * 100) / 100;
}

/** Reveal a cell. Returns whether it was safe. */
export function revealCell(
  session: MinesSession,
  cellIndex: number,
): { safe: boolean; multiplier: number } {
  if (session.grid[cellIndex]) {
    // Hit a mine
    return { safe: false, multiplier: 0 };
  }

  session.revealed[cellIndex] = true;
  session.safePicks++;
  session.currentMultiplier = calculateMultiplier(session.mineCount, session.safePicks);
  return { safe: true, multiplier: session.currentMultiplier };
}

/** Format the grid for display. */
export function formatGrid(session: MinesSession, revealAll = false): string {
  const rows: string[] = [];
  for (let r = 0; r < 4; r++) {
    const cells: string[] = [];
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      if (revealAll) {
        cells.push(session.grid[idx] ? ":boom:" : ":gem:");
      } else if (session.revealed[idx]) {
        cells.push(":gem:");
      } else {
        cells.push(":white_large_square:");
      }
    }
    rows.push(cells.join(" "));
  }
  return rows.join("\n");
}

export const mines = {
  async getSession(guildId: string, userId: string): Promise<MinesSession | null> {
    const session = await kv.get<MinesSession>(sessionKey(guildId, userId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, userId));
      return null;
    }
    return session;
  },

  async createSession(guildId: string, userId: string, bet: number, mineCount: number): Promise<MinesSession> {
    const session: MinesSession = {
      guildId,
      userId,
      bet,
      mineCount,
      grid: generateGrid(mineCount),
      revealed: new Array<boolean>(GRID_SIZE).fill(false),
      safePicks: 0,
      currentMultiplier: 1.0,
      status: "playing",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: MinesSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, userId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS };
