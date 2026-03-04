/**
 * discord/economy/activity-lock.ts
 *
 * Exclusive activity lock — a player can only do ONE economy action at a time.
 * Uses KV with key `activity:{guildId}:{userId}`.
 */

import { kv } from "../persistence/kv.ts";
import type { ActivityType, ActivityLock } from "./types.ts";

const EXPIRY_DEFAULTS: Record<ActivityType, number> = {
  farm: 24 * 60 * 60_000,
  mine: 24 * 60 * 60_000,
  forage: 24 * 60 * 60_000,
  job: 24 * 60 * 60_000,
  train: 24 * 60 * 60_000,
  arena: 30 * 60_000,
  blackjack: 10 * 60_000,
  adventure: 60 * 60_000,
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  farm: "farming",
  mine: "mining",
  forage: "foraging",
  job: "working a job shift",
  train: "training",
  arena: "in an arena fight",
  blackjack: "playing blackjack",
  adventure: "on an adventure",
};

function lockKey(guildId: string, userId: string): string {
  return `activity:${guildId}:${userId}`;
}

export const activityLock = {
  /**
   * Try to acquire a lock. Rejects if an unexpired lock already exists.
   */
  async acquireLock(
    guildId: string,
    userId: string,
    activityType: ActivityType,
    details?: string,
    expiresAt?: number,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string }> {
    const key = lockKey(guildId, userId);
    const existing = await kv.get<ActivityLock>(key);

    if (existing && existing.expiresAt > now) {
      const label = ACTIVITY_LABELS[existing.activityType];
      const detailStr = existing.details ? ` **${existing.details}**` : "";
      return {
        success: false,
        error: `You're currently ${label}${detailStr}! Finish that first.`,
      };
    }

    const lock: ActivityLock = {
      activityType,
      details,
      startedAt: now,
      expiresAt: expiresAt ?? now + EXPIRY_DEFAULTS[activityType],
    };

    await kv.set(key, lock);
    return { success: true };
  },

  /**
   * Release a lock.
   */
  async releaseLock(guildId: string, userId: string): Promise<void> {
    await kv.delete(lockKey(guildId, userId));
  },

  /**
   * Check if the user has no active activity. Returns descriptive error if locked.
   */
  async requireNoActivity(
    guildId: string,
    userId: string,
    now = Date.now(),
  ): Promise<{ allowed: boolean; error?: string }> {
    const existing = await kv.get<ActivityLock>(lockKey(guildId, userId));
    if (!existing || existing.expiresAt <= now) {
      // Auto-clean expired
      if (existing && existing.expiresAt <= now) {
        await kv.delete(lockKey(guildId, userId));
      }
      return { allowed: true };
    }

    const label = ACTIVITY_LABELS[existing.activityType];
    const detailStr = existing.details ? ` **${existing.details}**` : "";
    return {
      allowed: false,
      error: `You're currently ${label}${detailStr}! Finish that first.`,
    };
  },

  /**
   * Get the current lock (auto-cleans expired).
   */
  async getCurrentActivity(
    guildId: string,
    userId: string,
    now = Date.now(),
  ): Promise<ActivityLock | null> {
    const existing = await kv.get<ActivityLock>(lockKey(guildId, userId));
    if (!existing) return null;
    if (existing.expiresAt <= now) {
      await kv.delete(lockKey(guildId, userId));
      return null;
    }
    return existing;
  },
};

export const _internals = { lockKey, EXPIRY_DEFAULTS, ACTIVITY_LABELS };
