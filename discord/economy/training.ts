/**
 * discord/economy/training.ts
 *
 * Combat stats, training sessions, skill definitions, and derived stat computation.
 */

import { kv } from "../persistence/kv.ts";
import type {
  CombatStats, DerivedCombatStats, TrainableSkill, TrainableAttribute,
  WeaponMasteryType, TrainingSession, CombatSkill, CombatSkillEffect,
  WeaponDefinition,
} from "./types.ts";

// ── Constants ────────────────────────────────────────────

export const TRAINING_BASE_MS = 15 * 60_000; // 15 min
export const TRAINING_SCALE_MS = 2 * 60_000;  // +2 min per level
export const TRAINING_XP = 15;

// ── Combat Skills ────────────────────────────────────────

export const COMBAT_SKILLS: CombatSkill[] = [
  { id: "power-strike", name: "Power Strike", description: "Deal 1.5x damage", requiredAttribute: "strength", requiredLevel: 5, effect: "power-strike" },
  { id: "shield-wall", name: "Shield Wall", description: "Block 75% damage this turn", requiredAttribute: "defense", requiredLevel: 5, effect: "shield-wall" },
  { id: "quick-strike", name: "Quick Strike", description: "Guaranteed first strike", requiredAttribute: "speed", requiredLevel: 5, effect: "quick-strike" },
  { id: "heal", name: "Heal", description: "Restore 30% max HP", requiredAttribute: "vitality", requiredLevel: 5, effect: "heal" },
  { id: "berserk", name: "Berserk", description: "Deal 2.5x damage, take 1.5x next turn", requiredAttribute: "strength", requiredLevel: 10, effect: "berserk" },
];

// ── Skill Labels ─────────────────────────────────────────

const SKILL_LABELS: Record<TrainableSkill, string> = {
  strength: "Strength",
  defense: "Defense",
  speed: "Speed",
  vitality: "Vitality",
  sword: "Sword Mastery",
  bow: "Bow Mastery",
  magic: "Magic Mastery",
};

export function getSkillLabel(skill: TrainableSkill): string {
  return SKILL_LABELS[skill];
}

// ── KV Keys ──────────────────────────────────────────────

function statsKey(guildId: string, userId: string): string {
  return `combat-stats:${guildId}:${userId}`;
}

function trainingKey(guildId: string, userId: string): string {
  return `training:${guildId}:${userId}`;
}

// ── Default State ────────────────────────────────────────

function createDefaultStats(guildId: string, userId: string): CombatStats {
  const now = Date.now();
  return {
    userId, guildId,
    strength: 0, defense: 0, speed: 0, vitality: 0,
    swordMastery: 0, bowMastery: 0, magicMastery: 0,
    createdAt: now, updatedAt: now,
  };
}

// ── Attribute Getters ────────────────────────────────────

function getStatValue(stats: CombatStats, skill: TrainableSkill): number {
  switch (skill) {
    case "strength": return stats.strength;
    case "defense": return stats.defense;
    case "speed": return stats.speed;
    case "vitality": return stats.vitality;
    case "sword": return stats.swordMastery;
    case "bow": return stats.bowMastery;
    case "magic": return stats.magicMastery;
  }
}

function incrementStat(stats: CombatStats, skill: TrainableSkill): void {
  switch (skill) {
    case "strength": stats.strength++; break;
    case "defense": stats.defense++; break;
    case "speed": stats.speed++; break;
    case "vitality": stats.vitality++; break;
    case "sword": stats.swordMastery++; break;
    case "bow": stats.bowMastery++; break;
    case "magic": stats.magicMastery++; break;
  }
}

// ── Derived Stats ────────────────────────────────────────

export function computeDerivedStats(
  stats: CombatStats,
  playerLevel: number,
  weapon?: WeaponDefinition,
): DerivedCombatStats {
  const masteryBonus = weapon
    ? getMasteryForWeapon(stats, weapon.weaponType) * 2
    : 0;
  const weaponDamage = weapon ? weapon.damage : 0;

  return {
    maxHp: 50 + (playerLevel * 5) + (stats.vitality * 10),
    attack: 5 + (stats.strength * 3) + weaponDamage + masteryBonus,
    defense: 2 + (stats.defense * 2),
    speed: 5 + (stats.speed * 2),
    unlockedSkills: getUnlockedSkills(stats),
  };
}

function getMasteryForWeapon(stats: CombatStats, weaponType: string): number {
  switch (weaponType) {
    case "sword": return stats.swordMastery;
    case "bow": return stats.bowMastery;
    case "magic": return stats.magicMastery;
    default: return 0;
  }
}

function getUnlockedSkills(stats: CombatStats): CombatSkill[] {
  return COMBAT_SKILLS.filter((skill) => {
    const attrValue = getStatValue(stats, skill.requiredAttribute);
    return attrValue >= skill.requiredLevel;
  });
}

// ── Training Duration ────────────────────────────────────

export function trainingDuration(currentLevel: number): number {
  return TRAINING_BASE_MS + (currentLevel * TRAINING_SCALE_MS);
}

// ── Training API ─────────────────────────────────────────

export const training = {
  async getStats(guildId: string, userId: string): Promise<CombatStats> {
    const existing = await kv.get<CombatStats>(statsKey(guildId, userId));
    return existing ?? createDefaultStats(guildId, userId);
  },

  async getOrCreateStats(guildId: string, userId: string): Promise<CombatStats> {
    const existing = await kv.get<CombatStats>(statsKey(guildId, userId));
    if (existing) return existing;
    const stats = createDefaultStats(guildId, userId);
    await kv.set(statsKey(guildId, userId), stats);
    return stats;
  },

  async startTraining(
    guildId: string,
    userId: string,
    skill: TrainableSkill,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string; session?: TrainingSession; durationMs?: number }> {
    const existing = await kv.get<TrainingSession>(trainingKey(guildId, userId));
    if (existing && !existing.collected) {
      return { success: false, error: "You already have an active training session! Use `/train collect` to finish it." };
    }

    const stats = await this.getOrCreateStats(guildId, userId);
    const currentLevel = getStatValue(stats, skill);
    const durationMs = trainingDuration(currentLevel);

    const session: TrainingSession = {
      userId, guildId, skill,
      startedAt: now,
      readyAt: now + durationMs,
      collected: false,
    };

    await kv.set(trainingKey(guildId, userId), session);
    return { success: true, session, durationMs };
  },

  async collectTraining(
    guildId: string,
    userId: string,
    now = Date.now(),
  ): Promise<{ success: boolean; error?: string; skill?: TrainableSkill; newLevel?: number }> {
    const session = await kv.get<TrainingSession>(trainingKey(guildId, userId));
    if (!session) {
      return { success: false, error: "You don't have an active training session. Start one with `/train start`." };
    }
    if (session.collected) {
      return { success: false, error: "You already collected this training! Start a new one." };
    }
    if (now < session.readyAt) {
      const remainMs = session.readyAt - now;
      const mins = Math.ceil(remainMs / 60_000);
      return { success: false, error: `Training isn't done yet! Come back in **${mins}m**.` };
    }

    // Mark collected
    session.collected = true;
    await kv.set(trainingKey(guildId, userId), session);

    // Increment stat
    const newLevel = await kv.update<CombatStats>(statsKey(guildId, userId), (current) => {
      const stats = current ?? createDefaultStats(guildId, userId);
      incrementStat(stats, session.skill);
      stats.updatedAt = Date.now();
      return stats;
    }).then((stats) => getStatValue(stats, session.skill));

    return { success: true, skill: session.skill, newLevel };
  },

  async getSession(guildId: string, userId: string): Promise<TrainingSession | null> {
    return await kv.get<TrainingSession>(trainingKey(guildId, userId));
  },

  async equipWeapon(guildId: string, userId: string, weaponId: string): Promise<void> {
    await kv.update<CombatStats>(statsKey(guildId, userId), (current) => {
      const stats = current ?? createDefaultStats(guildId, userId);
      stats.equippedWeaponId = weaponId;
      stats.updatedAt = Date.now();
      return stats;
    });
  },
};

export const _internals = {
  statsKey, trainingKey, createDefaultStats, getStatValue, incrementStat, getMasteryForWeapon,
};
