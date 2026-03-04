/**
 * discord/economy/crimes.ts
 *
 * Crime definitions, outcome tables, and cooldown management.
 */

import { kv } from "../persistence/kv.ts";
import { secureRandomIndex } from "../helpers/crypto.ts";
import type { CrimeId, CrimeDefinition, CrimeState } from "./types.ts";

export const CRIME_DEFINITIONS: CrimeDefinition[] = [
  { id: "pickpocket", name: "Pickpocket", successRate: 80, rewardMin: 20, rewardMax: 80, fineMin: 10, fineMax: 30, cooldownMs: 30 * 60_000, requiredLevel: 0 },
  { id: "shoplifting", name: "Shoplifting", successRate: 65, rewardMin: 50, rewardMax: 200, fineMin: 30, fineMax: 80, cooldownMs: 45 * 60_000, requiredLevel: 3 },
  { id: "carjacking", name: "Carjacking", successRate: 50, rewardMin: 150, rewardMax: 500, fineMin: 80, fineMax: 200, cooldownMs: 60 * 60_000, requiredLevel: 8 },
  { id: "bank-robbery", name: "Bank Robbery", successRate: 35, rewardMin: 400, rewardMax: 1200, fineMin: 200, fineMax: 500, cooldownMs: 90 * 60_000, requiredLevel: 15 },
  { id: "heist", name: "Heist", successRate: 20, rewardMin: 1000, rewardMax: 5000, fineMin: 500, fineMax: 2000, cooldownMs: 120 * 60_000, requiredLevel: 25 },
];

function crimeKey(guildId: string, userId: string): string {
  return `crime:${guildId}:${userId}`;
}

export function getCrimeDefinition(crimeId: CrimeId): CrimeDefinition | undefined {
  return CRIME_DEFINITIONS.find((c) => c.id === crimeId);
}

function randomInRange(min: number, max: number): number {
  return min + secureRandomIndex(max - min + 1);
}

export interface CrimeOutcome {
  crime: CrimeDefinition;
  success: boolean;
  amount: number; // reward if success, fine if failure
  cooldownMs: number;
}

export function rollCrime(crime: CrimeDefinition): CrimeOutcome {
  const roll = secureRandomIndex(100);
  const success = roll < crime.successRate;
  const amount = success
    ? randomInRange(crime.rewardMin, crime.rewardMax)
    : randomInRange(crime.fineMin, crime.fineMax);
  return { crime, success, amount, cooldownMs: crime.cooldownMs };
}

export const crimes = {
  async getState(guildId: string, userId: string): Promise<CrimeState | null> {
    return await kv.get<CrimeState>(crimeKey(guildId, userId));
  },

  /**
   * Check if user is on cooldown. Returns remaining ms or 0 if ready.
   */
  async getCooldownRemaining(guildId: string, userId: string, now = Date.now()): Promise<number> {
    const state = await kv.get<CrimeState>(crimeKey(guildId, userId));
    if (!state) return 0;
    return Math.max(0, state.nextCrimeAt - now);
  },

  /**
   * Record a crime attempt. Returns updated state.
   */
  async recordAttempt(
    guildId: string,
    userId: string,
    success: boolean,
    cooldownMs: number,
    now = Date.now(),
  ): Promise<CrimeState> {
    return await kv.update<CrimeState>(crimeKey(guildId, userId), (current) => {
      const state: CrimeState = current ?? {
        userId, guildId,
        lastCrimeAt: 0, nextCrimeAt: 0,
        totalAttempts: 0, totalSuccesses: 0,
      };
      state.lastCrimeAt = now;
      state.nextCrimeAt = now + cooldownMs;
      state.totalAttempts++;
      if (success) state.totalSuccesses++;
      return state;
    });
  },
};

/**
 * XP award for a crime based on its index in CRIME_DEFINITIONS.
 * Success: 15–50, scales linearly. Failure: 5.
 */
export function crimeXpAward(crimeId: CrimeId, success: boolean): number {
  if (!success) return 5;
  const idx = CRIME_DEFINITIONS.findIndex((c) => c.id === crimeId);
  if (idx === -1) return 15;
  // Linear scale: 15 + (idx / 4) * 35 → pickpocket=15, heist=50
  return Math.round(15 + (idx / (CRIME_DEFINITIONS.length - 1)) * 35);
}

export const _internals = { crimeKey, randomInRange };
