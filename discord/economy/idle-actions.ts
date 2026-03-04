/**
 * discord/economy/idle-actions.ts
 *
 * Idle action tiers (farm, mine, forage), outcome rolling, and state management.
 */

import { kv } from "../persistence/kv.ts";
import { secureRandomIndex } from "../helpers/crypto.ts";
import type { IdleActionType, IdleActionTier, IdleActionState } from "./types.ts";

// ── Tier Definitions ─────────────────────────────────────

export const FARM_TIERS: IdleActionTier[] = [
  { id: "wheat", name: "Wheat", requiredLevel: 0, cooldownMs: 10 * 60_000, rewardMin: 15, rewardMax: 40, xpReward: 10, rareChance: 5, rareMultiplier: 3 },
  { id: "corn", name: "Corn", requiredLevel: 5, cooldownMs: 15 * 60_000, rewardMin: 30, rewardMax: 80, xpReward: 15, rareChance: 8, rareMultiplier: 3 },
  { id: "potatoes", name: "Potatoes", requiredLevel: 10, cooldownMs: 20 * 60_000, rewardMin: 60, rewardMax: 150, xpReward: 20, rareChance: 10, rareMultiplier: 3 },
  { id: "tomatoes", name: "Tomatoes", requiredLevel: 20, cooldownMs: 25 * 60_000, rewardMin: 100, rewardMax: 300, xpReward: 25, rareChance: 12, rareMultiplier: 4 },
  { id: "golden-apples", name: "Golden Apples", requiredLevel: 35, cooldownMs: 30 * 60_000, rewardMin: 200, rewardMax: 600, xpReward: 30, rareChance: 15, rareMultiplier: 5 },
];

export const MINE_TIERS: IdleActionTier[] = [
  { id: "copper", name: "Copper", requiredLevel: 0, cooldownMs: 12 * 60_000, rewardMin: 20, rewardMax: 50, xpReward: 10, rareChance: 5, rareMultiplier: 3 },
  { id: "iron", name: "Iron", requiredLevel: 5, cooldownMs: 18 * 60_000, rewardMin: 40, rewardMax: 100, xpReward: 15, rareChance: 8, rareMultiplier: 3 },
  { id: "silver", name: "Silver", requiredLevel: 12, cooldownMs: 25 * 60_000, rewardMin: 80, rewardMax: 200, xpReward: 20, rareChance: 10, rareMultiplier: 4 },
  { id: "gold", name: "Gold", requiredLevel: 22, cooldownMs: 30 * 60_000, rewardMin: 150, rewardMax: 400, xpReward: 25, rareChance: 12, rareMultiplier: 4 },
  { id: "diamonds", name: "Diamonds", requiredLevel: 40, cooldownMs: 40 * 60_000, rewardMin: 300, rewardMax: 800, xpReward: 30, rareChance: 15, rareMultiplier: 5 },
];

export const FORAGE_TIERS: IdleActionTier[] = [
  { id: "herbs", name: "Herbs", requiredLevel: 0, cooldownMs: 8 * 60_000, rewardMin: 10, rewardMax: 30, xpReward: 8, rareChance: 5, rareMultiplier: 3 },
  { id: "mushrooms", name: "Mushrooms", requiredLevel: 4, cooldownMs: 12 * 60_000, rewardMin: 25, rewardMax: 70, xpReward: 12, rareChance: 8, rareMultiplier: 3 },
  { id: "berries", name: "Berries", requiredLevel: 9, cooldownMs: 18 * 60_000, rewardMin: 50, rewardMax: 130, xpReward: 18, rareChance: 10, rareMultiplier: 3 },
  { id: "truffles", name: "Truffles", requiredLevel: 18, cooldownMs: 22 * 60_000, rewardMin: 90, rewardMax: 250, xpReward: 22, rareChance: 12, rareMultiplier: 4 },
  { id: "ancient-relics", name: "Ancient Relics", requiredLevel: 30, cooldownMs: 35 * 60_000, rewardMin: 180, rewardMax: 500, xpReward: 28, rareChance: 15, rareMultiplier: 5 },
];

// ── Outcome Rolling ──────────────────────────────────────

function randomInRange(min: number, max: number): number {
  return min + secureRandomIndex(max - min + 1);
}

export interface IdleOutcome {
  tier: IdleActionTier;
  reward: number;
  xp: number;
  isRare: boolean;
}

export function rollIdleOutcome(tier: IdleActionTier): IdleOutcome {
  let reward = randomInRange(tier.rewardMin, tier.rewardMax);
  let xpAmount = tier.xpReward;
  const rareRoll = secureRandomIndex(100);
  const isRare = rareRoll < tier.rareChance;

  if (isRare) {
    reward = Math.floor(reward * tier.rareMultiplier);
    xpAmount += 25; // IDLE_RARE_BONUS
  }

  return { tier, reward, xp: xpAmount, isRare };
}

// ── State Constants ──────────────────────────────────────

const STALE_EXPIRY_MS = 24 * 60 * 60_000; // 24 hours

// ── State Management ─────────────────────────────────────

function idleKey(actionType: IdleActionType, guildId: string, userId: string): string {
  return `${actionType}:${guildId}:${userId}`;
}

export const idleActions = {
  async getState(actionType: IdleActionType, guildId: string, userId: string, now = Date.now()): Promise<IdleActionState | null> {
    const state = await kv.get<IdleActionState>(idleKey(actionType, guildId, userId));
    if (!state) return null;
    // Expire stale actions
    if (now - state.startedAt > STALE_EXPIRY_MS) {
      await kv.delete(idleKey(actionType, guildId, userId));
      return null;
    }
    return state;
  },

  async startAction(
    actionType: IdleActionType,
    guildId: string,
    userId: string,
    tier: IdleActionTier,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string; state?: IdleActionState }> {
    const existing = await this.getState(actionType, guildId, userId);
    if (existing && !existing.collected) {
      return { success: false, error: `You already have an active ${actionType} session! Use \`/${actionType} harvest\` or \`/${actionType} status\` to check on it.` };
    }

    const state: IdleActionState = {
      userId,
      guildId,
      actionType,
      tierId: tier.id,
      startedAt: now,
      readyAt: now + tier.cooldownMs,
      collected: false,
    };

    await kv.set(idleKey(actionType, guildId, userId), state);
    return { success: true, state };
  },

  async collectAction(
    actionType: IdleActionType,
    guildId: string,
    userId: string,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string; state?: IdleActionState }> {
    const state = await this.getState(actionType, guildId, userId, now);
    if (!state) {
      return { success: false, error: `You don't have an active ${actionType} session. Start one first!` };
    }
    if (state.collected) {
      return { success: false, error: "You already collected this harvest! Start a new one." };
    }
    if (now < state.readyAt) {
      const remainMs = state.readyAt - now;
      const mins = Math.ceil(remainMs / 60_000);
      return { success: false, error: `Not ready yet! Come back in **${mins}m**.` };
    }

    // Mark collected
    state.collected = true;
    await kv.set(idleKey(actionType, guildId, userId), state);
    return { success: true, state };
  },

  getAvailableTiers(tiers: IdleActionTier[], playerLevel: number): IdleActionTier[] {
    return tiers.filter((t) => playerLevel >= t.requiredLevel);
  },

  getTier(tiers: IdleActionTier[], tierId: string): IdleActionTier | undefined {
    return tiers.find((t) => t.id === tierId);
  },
};

export const _internals = { idleKey, randomInRange, STALE_EXPIRY_MS };
