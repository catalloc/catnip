/**
 * discord/economy/xp.ts
 *
 * XP & Level system — formulas, state management, and XP award constants.
 */

import { kv } from "../persistence/kv.ts";
import type { XpState } from "./types.ts";

// ── Constants ────────────────────────────────────────────

export const XP_BASE = 100;
export const XP_EXPONENT = 1.5;

export const XP_AWARDS = {
  JOB_COLLECT_PER_HOUR: 5,
  CRIME_SUCCESS_MIN: 15,
  CRIME_SUCCESS_MAX: 50,
  CRIME_FAILURE: 5,
  IDLE_HARVEST_MIN: 8,
  IDLE_HARVEST_MAX: 30,
  IDLE_RARE_BONUS: 25,
  CASINO_WIN: 10,
  CASINO_LOSS: 3,
} as const;

// ── Pure Functions ───────────────────────────────────────

/**
 * XP needed to reach level N from level N-1.
 * Formula: floor(100 * N^1.5)
 */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(XP_BASE * Math.pow(level, XP_EXPONENT));
}

/**
 * Total cumulative XP needed to reach a given level.
 */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i <= level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/**
 * Determine level from current XP.
 */
export function levelFromXp(xpAmount: number): number {
  let level = 0;
  let remaining = xpAmount;
  while (remaining >= xpForLevel(level + 1)) {
    level++;
    remaining -= xpForLevel(level);
  }
  return level;
}

/**
 * XP remaining until the next level.
 */
export function xpToNextLevel(xpAmount: number): { current: number; needed: number } {
  const level = levelFromXp(xpAmount);
  const xpAtLevelStart = totalXpForLevel(level);
  const current = xpAmount - xpAtLevelStart;
  const needed = xpForLevel(level + 1);
  return { current, needed };
}

/**
 * Render an XP progress bar.
 * Example: `██████░░░░ 450/783 XP`
 */
export function makeXpBar(xpAmount: number, barLength = 10): string {
  const { current, needed } = xpToNextLevel(xpAmount);
  const filled = needed > 0 ? Math.floor((current / needed) * barLength) : 0;
  const empty = barLength - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${current.toLocaleString()}/${needed.toLocaleString()} XP`;
}

// ── KV State Management ─────────────────────────────────

function xpKey(guildId: string, userId: string): string {
  return `xp:${guildId}:${userId}`;
}

function xpPrefix(guildId: string): string {
  return `xp:${guildId}:`;
}

function createDefault(guildId: string, userId: string): XpState {
  const now = Date.now();
  return {
    userId,
    guildId,
    xp: 0,
    level: 0,
    totalXpEarned: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface XpGrantResult {
  state: XpState;
  xpGained: number;
  levelsGained: number;
  newLevel: number;
}

export const xp = {
  async getOrCreate(guildId: string, userId: string): Promise<XpState> {
    const existing = await kv.get<XpState>(xpKey(guildId, userId));
    if (existing) return existing;
    const state = createDefault(guildId, userId);
    await kv.set(xpKey(guildId, userId), state);
    return state;
  },

  async getLevel(guildId: string, userId: string): Promise<number> {
    const state = await this.getOrCreate(guildId, userId);
    return state.level;
  },

  /**
   * Batch-fetch levels for multiple users. Returns a Map<userId, level>.
   * Users without XP state default to level 0.
   */
  async getLevels(guildId: string, userIds: string[]): Promise<Map<string, number>> {
    const entries = await kv.list(xpPrefix(guildId));
    const stateMap = new Map<string, XpState>();
    for (const e of entries) {
      const s = e.value as XpState;
      if (s?.userId) stateMap.set(s.userId, s);
    }
    const result = new Map<string, number>();
    for (const uid of userIds) {
      result.set(uid, stateMap.get(uid)?.level ?? 0);
    }
    return result;
  },

  /**
   * Grant XP to a user. Recomputes level. Returns grant result with levelsGained.
   */
  async grantXp(guildId: string, userId: string, amount: number): Promise<XpGrantResult> {
    let xpGained = amount;
    let levelsGained = 0;
    let newLevel = 0;

    const state = await kv.update<XpState>(xpKey(guildId, userId), (current) => {
      const s = current ?? createDefault(guildId, userId);
      const oldLevel = s.level;
      s.xp += amount;
      s.totalXpEarned += amount;
      s.level = levelFromXp(s.xp);
      s.updatedAt = Date.now();
      levelsGained = s.level - oldLevel;
      newLevel = s.level;
      return s;
    });

    return { state, xpGained, levelsGained, newLevel };
  },
};

export const _internals = { xpKey, xpPrefix, createDefault };
