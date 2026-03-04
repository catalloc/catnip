/**
 * discord/economy/jobs.ts
 *
 * Job tier definitions, earnings computation, and job state management.
 */

import { kv } from "../persistence/kv.ts";
import type { JobTierId, JobTierConfig, JobState, JobShiftState } from "./types.ts";

export const DEFAULT_JOB_TIERS: JobTierConfig[] = [
  { id: "unemployed", name: "Unemployed", hourlyRate: 0, shopPrice: 0, shiftDurationMs: 0, shiftPayout: 0 },
  { id: "burger-flipper", name: "Burger Flipper", hourlyRate: 10, shopPrice: 100, shiftDurationMs: 15 * 60_000, shiftPayout: 15 },
  { id: "cashier", name: "Cashier", hourlyRate: 25, shopPrice: 300, shiftDurationMs: 15 * 60_000, shiftPayout: 38 },
  { id: "mechanic", name: "Mechanic", hourlyRate: 50, shopPrice: 750, shiftDurationMs: 20 * 60_000, shiftPayout: 67 },
  { id: "chef", name: "Chef", hourlyRate: 80, shopPrice: 1500, shiftDurationMs: 20 * 60_000, shiftPayout: 107 },
  { id: "programmer", name: "Programmer", hourlyRate: 120, shopPrice: 3000, shiftDurationMs: 25 * 60_000, shiftPayout: 200 },
  { id: "doctor", name: "Doctor", hourlyRate: 180, shopPrice: 6000, shiftDurationMs: 25 * 60_000, shiftPayout: 300 },
  { id: "lawyer", name: "Lawyer", hourlyRate: 250, shopPrice: 10000, shiftDurationMs: 30 * 60_000, shiftPayout: 500 },
  { id: "ceo", name: "CEO", hourlyRate: 350, shopPrice: 20000, shiftDurationMs: 30 * 60_000, shiftPayout: 700 },
  { id: "mafia-boss", name: "Mafia Boss", hourlyRate: 500, shopPrice: 50000, shiftDurationMs: 30 * 60_000, shiftPayout: 1000 },
];

export const SHIFT_XP: Record<string, number> = {
  "burger-flipper": 5, "cashier": 5, "mechanic": 8, "chef": 8,
  "programmer": 10, "doctor": 10, "lawyer": 12, "ceo": 12, "mafia-boss": 15,
};

function jobKey(guildId: string, userId: string): string {
  return `job:${guildId}:${userId}`;
}

function createDefault(guildId: string, userId: string): JobState {
  const now = Date.now();
  return {
    userId,
    guildId,
    tierId: "unemployed",
    lastCollectedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function getTierConfig(tierId: JobTierId): JobTierConfig {
  return DEFAULT_JOB_TIERS.find((t) => t.id === tierId) ?? DEFAULT_JOB_TIERS[0];
}

export function getTierIndex(tierId: JobTierId): number {
  return DEFAULT_JOB_TIERS.findIndex((t) => t.id === tierId);
}

/**
 * Compute earnings based on hours elapsed since last collection.
 * Returns the number of whole hours and coins earned.
 */
export function computeEarnings(
  lastCollectedAt: number,
  hourlyRate: number,
  now = Date.now(),
): { hours: number; coins: number } {
  const elapsed = Math.max(0, now - lastCollectedAt);
  const hours = Math.floor(elapsed / 3_600_000);
  return { hours, coins: hours * hourlyRate };
}

export const jobs = {
  async getJobState(guildId: string, userId: string): Promise<JobState | null> {
    return await kv.get<JobState>(jobKey(guildId, userId));
  },

  async getOrCreate(guildId: string, userId: string): Promise<JobState> {
    const existing = await kv.get<JobState>(jobKey(guildId, userId));
    if (existing) return existing;
    const state = createDefault(guildId, userId);
    await kv.set(jobKey(guildId, userId), state);
    return state;
  },

  /**
   * Collect earnings. Updates lastCollectedAt first (prevents double-collect),
   * then returns the computed earnings for the caller to credit.
   */
  async collect(guildId: string, userId: string, now = Date.now()): Promise<{ hours: number; coins: number }> {
    let hours = 0;
    let coins = 0;
    await kv.update<JobState>(jobKey(guildId, userId), (current) => {
      const state = current ?? createDefault(guildId, userId);
      const tier = getTierConfig(state.tierId);
      const earnings = computeEarnings(state.lastCollectedAt, tier.hourlyRate, now);
      hours = earnings.hours;
      coins = earnings.coins;
      state.lastCollectedAt = now;
      state.updatedAt = now;
      return state;
    });
    return { hours, coins };
  },

  /**
   * Upgrade a user's job tier. Returns success status.
   */
  async setTier(guildId: string, userId: string, tierId: JobTierId): Promise<JobState> {
    return await kv.update<JobState>(jobKey(guildId, userId), (current) => {
      const state = current ?? createDefault(guildId, userId);
      state.tierId = tierId;
      state.updatedAt = Date.now();
      return state;
    });
  },
};

// ── Shift Methods ──────────────────────────────────────

function shiftKey(guildId: string, userId: string): string {
  return `job-shift:${guildId}:${userId}`;
}

export const shifts = {
  async getShift(guildId: string, userId: string): Promise<JobShiftState | null> {
    return await kv.get<JobShiftState>(shiftKey(guildId, userId));
  },

  async startShift(
    guildId: string,
    userId: string,
    tierId: JobTierId,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string; state?: JobShiftState }> {
    const tier = getTierConfig(tierId);
    if (tier.shiftDurationMs === 0) {
      return { success: false, error: "You're unemployed! Buy a job upgrade from `/shop browse` first." };
    }

    const existing = await kv.get<JobShiftState>(shiftKey(guildId, userId));
    if (existing && !existing.collected) {
      return { success: false, error: "You already have an active shift! Use `/job collect` to finish it." };
    }

    const state: JobShiftState = {
      userId,
      guildId,
      tierId,
      startedAt: now,
      readyAt: now + tier.shiftDurationMs,
      collected: false,
    };

    await kv.set(shiftKey(guildId, userId), state);
    return { success: true, state };
  },

  async collectShift(
    guildId: string,
    userId: string,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string; state?: JobShiftState; coins?: number; xpAmount?: number }> {
    const state = await kv.get<JobShiftState>(shiftKey(guildId, userId));
    if (!state) {
      return { success: false, error: "You don't have an active shift. Start one with `/job start`." };
    }
    if (state.collected) {
      return { success: false, error: "You already collected this shift! Start a new one." };
    }
    if (now < state.readyAt) {
      const remainMs = state.readyAt - now;
      const mins = Math.ceil(remainMs / 60_000);
      return { success: false, error: `Your shift isn't done yet! Come back in **${mins}m**.` };
    }

    state.collected = true;
    await kv.set(shiftKey(guildId, userId), state);

    const tier = getTierConfig(state.tierId);
    const xpAmount = SHIFT_XP[state.tierId] ?? 0;

    return { success: true, state, coins: tier.shiftPayout, xpAmount };
  },
};

export const _internals = { jobKey, createDefault, shiftKey };
