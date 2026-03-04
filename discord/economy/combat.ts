/**
 * discord/economy/combat.ts
 *
 * Monster definitions, weapon definitions, damage calculations,
 * arena session CRUD, and turn resolution.
 */

import { kv } from "../persistence/kv.ts";
import { secureRandomIndex } from "../helpers/crypto.ts";
import type {
  MonsterDefinition, WeaponDefinition, ArenaSession,
  DerivedCombatStats, CombatSkillEffect,
} from "./types.ts";

// ── Monster Definitions ──────────────────────────────────

export const MONSTERS: MonsterDefinition[] = [
  { id: "slime", name: "Slime", emoji: "\u{1F7E2}", requiredLevel: 0, hp: 30, attack: 4, defense: 1, speed: 2, rewardMin: 10, rewardMax: 30, xpReward: 15 },
  { id: "goblin", name: "Goblin", emoji: "\u{1F47A}", requiredLevel: 3, hp: 50, attack: 8, defense: 3, speed: 5, rewardMin: 25, rewardMax: 60, xpReward: 25 },
  { id: "skeleton", name: "Skeleton", emoji: "\u{1F480}", requiredLevel: 8, hp: 80, attack: 12, defense: 5, speed: 4, rewardMin: 50, rewardMax: 120, xpReward: 40 },
  { id: "dire-wolf", name: "Dire Wolf", emoji: "\u{1F43A}", requiredLevel: 13, hp: 100, attack: 16, defense: 6, speed: 10, rewardMin: 80, rewardMax: 200, xpReward: 55 },
  { id: "orc-warrior", name: "Orc Warrior", emoji: "\u{1F479}", requiredLevel: 18, hp: 150, attack: 22, defense: 10, speed: 6, rewardMin: 120, rewardMax: 300, xpReward: 75 },
  { id: "dark-mage", name: "Dark Mage", emoji: "\u{1F9D9}", requiredLevel: 25, hp: 120, attack: 30, defense: 8, speed: 12, rewardMin: 200, rewardMax: 500, xpReward: 100 },
  { id: "dragon-whelp", name: "Dragon Whelp", emoji: "\u{1F409}", requiredLevel: 32, hp: 250, attack: 35, defense: 15, speed: 9, rewardMin: 350, rewardMax: 800, xpReward: 140 },
  { id: "ancient-golem", name: "Ancient Golem", emoji: "\u{1F5FF}", requiredLevel: 40, hp: 400, attack: 40, defense: 25, speed: 3, rewardMin: 500, rewardMax: 1200, xpReward: 200 },
];

// ── Weapon Definitions ───────────────────────────────────

export const WEAPONS: WeaponDefinition[] = [
  { id: "wooden-sword", name: "Wooden Sword", damage: 3, weaponType: "sword", requiredLevel: 0 },
  { id: "short-bow", name: "Short Bow", damage: 5, weaponType: "bow", requiredLevel: 3 },
  { id: "apprentice-staff", name: "Apprentice Staff", damage: 4, weaponType: "magic", requiredLevel: 2 },
  { id: "iron-sword", name: "Iron Sword", damage: 8, weaponType: "sword", requiredLevel: 5 },
  { id: "longbow", name: "Longbow", damage: 12, weaponType: "bow", requiredLevel: 12 },
  { id: "steel-sword", name: "Steel Sword", damage: 15, weaponType: "sword", requiredLevel: 15 },
  { id: "arcane-staff", name: "Arcane Staff", damage: 14, weaponType: "magic", requiredLevel: 18 },
];

export function getWeapon(weaponId: string): WeaponDefinition | undefined {
  return WEAPONS.find((w) => w.id === weaponId);
}

export function getMonster(monsterId: string): MonsterDefinition | undefined {
  return MONSTERS.find((m) => m.id === monsterId);
}

export function getAvailableMonsters(playerLevel: number): MonsterDefinition[] {
  return MONSTERS.filter((m) => playerLevel >= m.requiredLevel);
}

// ── Arena Session CRUD ───────────────────────────────────

function arenaKey(guildId: string, userId: string): string {
  return `arena:${guildId}:${userId}`;
}

export const arena = {
  async getSession(guildId: string, userId: string): Promise<ArenaSession | null> {
    return await kv.get<ArenaSession>(arenaKey(guildId, userId));
  },

  async createSession(
    guildId: string,
    userId: string,
    monster: MonsterDefinition,
    playerStats: DerivedCombatStats,
  ): Promise<ArenaSession> {
    const session: ArenaSession = {
      guildId, userId, monster,
      playerHp: playerStats.maxHp,
      playerMaxHp: playerStats.maxHp,
      monsterHp: monster.hp,
      monsterMaxHp: monster.hp,
      playerStats,
      turn: 0,
      status: "active",
      berserkActive: false,
      shieldActive: false,
      log: [],
      createdAt: Date.now(),
    };
    await kv.set(arenaKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: ArenaSession): Promise<void> {
    await kv.set(arenaKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(arenaKey(guildId, userId));
  },
};

// ── Damage Calculation ───────────────────────────────────

function randomInRange(min: number, max: number): number {
  return min + secureRandomIndex(max - min + 1);
}

export function calculateDamage(attack: number, defense: number): number {
  return Math.max(1, attack - defense + randomInRange(-2, 2));
}

// ── Turn Resolution ──────────────────────────────────────

export type ArenaAction = "attack" | "defend" | "flee" | "skill";

export interface TurnResult {
  session: ArenaSession;
  ended: boolean;
  rewardCoins?: number;
  rewardXp?: number;
}

export function resolveTurn(
  session: ArenaSession,
  action: ArenaAction,
  skillEffect?: CombatSkillEffect,
): TurnResult {
  session.turn++;

  // Clear previous-turn flags
  const wasBerserk = session.berserkActive;
  session.berserkActive = false;
  session.shieldActive = false;

  // ── Flee ──
  if (action === "flee") {
    const fleeRoll = secureRandomIndex(100);
    if (fleeRoll < 50) {
      session.status = "fled";
      session.log.push("You fled from battle!");
      return { session, ended: true };
    }
    session.log.push("You tried to flee but couldn't escape!");
    // Monster still attacks
    const monsterDmg = calculateDamage(session.monster.attack, session.playerStats.defense);
    const actualMonsterDmg = wasBerserk ? Math.ceil(monsterDmg * 1.5) : monsterDmg;
    session.playerHp = Math.max(0, session.playerHp - actualMonsterDmg);
    session.log.push(`${session.monster.name} attacks you for **${actualMonsterDmg}** damage!`);
    if (session.playerHp <= 0) {
      session.status = "defeat";
      return { session, ended: true };
    }
    return { session, ended: false };
  }

  // ── Defend ──
  if (action === "defend") {
    session.shieldActive = true;
    session.log.push("You brace for impact! (50% damage reduction)");
  }

  // ── Skill ──
  let playerDamageMultiplier = 1;
  let skipPlayerAttack = false;

  if (action === "skill" && skillEffect) {
    switch (skillEffect) {
      case "power-strike":
        playerDamageMultiplier = 1.5;
        session.log.push("You use **Power Strike**!");
        break;
      case "shield-wall":
        session.shieldActive = true;
        skipPlayerAttack = true;
        session.log.push("You raise a **Shield Wall**! (75% damage reduction)");
        break;
      case "quick-strike": {
        // Player always goes first + attack
        const qs = calculateDamage(session.playerStats.attack, session.monster.defense);
        session.monsterHp = Math.max(0, session.monsterHp - qs);
        session.log.push(`You use **Quick Strike** for **${qs}** damage!`);
        if (session.monsterHp <= 0) {
          session.status = "victory";
          const coins = randomInRange(session.monster.rewardMin, session.monster.rewardMax);
          return { session, ended: true, rewardCoins: coins, rewardXp: session.monster.xpReward };
        }
        skipPlayerAttack = true;
        break;
      }
      case "heal": {
        const healAmount = Math.floor(session.playerMaxHp * 0.3);
        session.playerHp = Math.min(session.playerMaxHp, session.playerHp + healAmount);
        skipPlayerAttack = true;
        session.log.push(`You use **Heal** and restore **${healAmount}** HP!`);
        break;
      }
      case "berserk":
        playerDamageMultiplier = 2.5;
        session.berserkActive = true;
        session.log.push("You enter a **Berserk** rage!");
        break;
    }
  }

  // ── Determine turn order by speed ──
  const playerGoesFirst = session.playerStats.speed >= session.monster.speed;

  if (playerGoesFirst) {
    // Player attacks
    if (!skipPlayerAttack && action !== "defend") {
      const rawDmg = calculateDamage(session.playerStats.attack, session.monster.defense);
      const dmg = Math.ceil(rawDmg * playerDamageMultiplier);
      session.monsterHp = Math.max(0, session.monsterHp - dmg);
      session.log.push(`You attack ${session.monster.name} for **${dmg}** damage!`);
      if (session.monsterHp <= 0) {
        session.status = "victory";
        const coins = randomInRange(session.monster.rewardMin, session.monster.rewardMax);
        return { session, ended: true, rewardCoins: coins, rewardXp: session.monster.xpReward };
      }
    }

    // Monster attacks
    const monsterDmg = calculateDamage(session.monster.attack, session.playerStats.defense);
    let actualMonsterDmg = wasBerserk ? Math.ceil(monsterDmg * 1.5) : monsterDmg;
    if (session.shieldActive) {
      const reduction = skillEffect === "shield-wall" ? 0.75 : 0.5;
      actualMonsterDmg = Math.ceil(actualMonsterDmg * (1 - reduction));
    }
    session.playerHp = Math.max(0, session.playerHp - actualMonsterDmg);
    session.log.push(`${session.monster.name} attacks you for **${actualMonsterDmg}** damage!`);
    if (session.playerHp <= 0) {
      session.status = "defeat";
      return { session, ended: true };
    }
  } else {
    // Monster attacks first
    const monsterDmg = calculateDamage(session.monster.attack, session.playerStats.defense);
    let actualMonsterDmg = wasBerserk ? Math.ceil(monsterDmg * 1.5) : monsterDmg;
    if (session.shieldActive) {
      const reduction = skillEffect === "shield-wall" ? 0.75 : 0.5;
      actualMonsterDmg = Math.ceil(actualMonsterDmg * (1 - reduction));
    }
    session.playerHp = Math.max(0, session.playerHp - actualMonsterDmg);
    session.log.push(`${session.monster.name} attacks you for **${actualMonsterDmg}** damage!`);
    if (session.playerHp <= 0) {
      session.status = "defeat";
      return { session, ended: true };
    }

    // Player attacks
    if (!skipPlayerAttack && action !== "defend") {
      const rawDmg = calculateDamage(session.playerStats.attack, session.monster.defense);
      const dmg = Math.ceil(rawDmg * playerDamageMultiplier);
      session.monsterHp = Math.max(0, session.monsterHp - dmg);
      session.log.push(`You attack ${session.monster.name} for **${dmg}** damage!`);
      if (session.monsterHp <= 0) {
        session.status = "victory";
        const coins = randomInRange(session.monster.rewardMin, session.monster.rewardMax);
        return { session, ended: true, rewardCoins: coins, rewardXp: session.monster.xpReward };
      }
    }
  }

  return { session, ended: false };
}

// ── HP Bar ───────────────────────────────────────────────

export function hpBar(current: number, max: number, length = 10): string {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

export const _internals = { arenaKey, randomInRange };
