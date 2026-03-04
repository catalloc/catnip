/**
 * discord/economy/dungeon.ts
 *
 * Dungeon definitions, monsters, session CRUD, and turn resolution
 * for multi-floor PvE adventures.
 */

import { kv } from "../persistence/kv.ts";
import { secureRandomIndex } from "../helpers/crypto.ts";
import { calculateDamage } from "./combat.ts";
import { getConsumableItem } from "./inventory.ts";
import type {
  MonsterDefinition, DungeonDefinition, DungeonSession, DungeonCombatState,
  DerivedCombatStats, InventorySlot, ActiveBuff, CombatSkillEffect,
  ConsumableItemId,
} from "./types.ts";

// ── Dungeon Monsters ────────────────────────────────────

export const DUNGEON_MONSTERS: MonsterDefinition[] = [
  // Goblin Cave
  { id: "cave-rat", name: "Cave Rat", emoji: "\u{1F400}", requiredLevel: 0, hp: 20, attack: 3, defense: 0, speed: 3, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "cave-bat", name: "Cave Bat", emoji: "\u{1F987}", requiredLevel: 0, hp: 15, attack: 4, defense: 0, speed: 6, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "goblin-grunt", name: "Goblin Grunt", emoji: "\u{1F47A}", requiredLevel: 0, hp: 35, attack: 6, defense: 2, speed: 4, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "goblin-shaman", name: "Goblin Shaman", emoji: "\u{1F9D9}", requiredLevel: 0, hp: 30, attack: 8, defense: 1, speed: 3, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "goblin-chief", name: "Goblin Chief", emoji: "\u{1F451}", requiredLevel: 0, hp: 60, attack: 10, defense: 5, speed: 5, rewardMin: 0, rewardMax: 0, xpReward: 0 },

  // Skeleton Crypt
  { id: "bone-rattler", name: "Bone Rattler", emoji: "\u{1F9B4}", requiredLevel: 8, hp: 40, attack: 9, defense: 3, speed: 4, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "tomb-spider", name: "Tomb Spider", emoji: "\u{1F577}\uFE0F", requiredLevel: 8, hp: 35, attack: 11, defense: 2, speed: 8, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "skeleton-knight", name: "Skeleton Knight", emoji: "\u2694\uFE0F", requiredLevel: 8, hp: 65, attack: 13, defense: 7, speed: 5, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "skeletal-archer", name: "Skeletal Archer", emoji: "\u{1F3F9}", requiredLevel: 8, hp: 50, attack: 15, defense: 4, speed: 9, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "bone-mage", name: "Bone Mage", emoji: "\u{1F480}", requiredLevel: 8, hp: 55, attack: 18, defense: 5, speed: 6, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "crypt-lord", name: "Crypt Lord", emoji: "\u{1F47B}", requiredLevel: 8, hp: 100, attack: 20, defense: 10, speed: 7, rewardMin: 0, rewardMax: 0, xpReward: 0 },

  // Dark Forest
  { id: "shadow-wolf", name: "Shadow Wolf", emoji: "\u{1F43A}", requiredLevel: 18, hp: 60, attack: 15, defense: 5, speed: 10, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "venomous-vine", name: "Venomous Vine", emoji: "\u{1F33F}", requiredLevel: 18, hp: 50, attack: 18, defense: 3, speed: 2, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "forest-troll", name: "Forest Troll", emoji: "\u{1F9CC}", requiredLevel: 18, hp: 90, attack: 20, defense: 8, speed: 4, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "shadow-stalker", name: "Shadow Stalker", emoji: "\u{1F464}", requiredLevel: 18, hp: 70, attack: 22, defense: 6, speed: 12, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "corrupted-treant", name: "Corrupted Treant", emoji: "\u{1F333}", requiredLevel: 18, hp: 120, attack: 18, defense: 14, speed: 2, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "dark-druid", name: "Dark Druid", emoji: "\u{1F9D9}", requiredLevel: 18, hp: 80, attack: 25, defense: 7, speed: 8, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "shadow-beast", name: "Shadow Beast", emoji: "\u{1F608}", requiredLevel: 18, hp: 130, attack: 28, defense: 10, speed: 9, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "forest-wraith", name: "Forest Wraith", emoji: "\u{1F47B}", requiredLevel: 18, hp: 150, attack: 30, defense: 12, speed: 11, rewardMin: 0, rewardMax: 0, xpReward: 0 },

  // Fire Caverns
  { id: "magma-slug", name: "Magma Slug", emoji: "\u{1F40C}", requiredLevel: 30, hp: 80, attack: 20, defense: 8, speed: 2, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "fire-imp", name: "Fire Imp", emoji: "\u{1F608}", requiredLevel: 30, hp: 60, attack: 25, defense: 5, speed: 12, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "lava-golem", name: "Lava Golem", emoji: "\u{1F5FF}", requiredLevel: 30, hp: 140, attack: 28, defense: 15, speed: 3, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "infernal-hound", name: "Infernal Hound", emoji: "\u{1F415}\u200D\u{1F9BA}", requiredLevel: 30, hp: 100, attack: 30, defense: 10, speed: 14, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "ember-wyrm", name: "Ember Wyrm", emoji: "\u{1F409}", requiredLevel: 30, hp: 160, attack: 33, defense: 12, speed: 8, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "flame-sorcerer", name: "Flame Sorcerer", emoji: "\u{1F525}", requiredLevel: 30, hp: 120, attack: 35, defense: 10, speed: 10, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "magma-titan", name: "Magma Titan", emoji: "\u{1F5FF}", requiredLevel: 30, hp: 200, attack: 38, defense: 20, speed: 4, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "inferno-drake", name: "Inferno Drake", emoji: "\u{1F432}", requiredLevel: 30, hp: 250, attack: 42, defense: 18, speed: 11, rewardMin: 0, rewardMax: 0, xpReward: 0 },

  // Abyssal Depths
  { id: "deep-lurker", name: "Deep Lurker", emoji: "\u{1F991}", requiredLevel: 40, hp: 120, attack: 30, defense: 12, speed: 6, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "void-shade", name: "Void Shade", emoji: "\u{1F464}", requiredLevel: 40, hp: 100, attack: 35, defense: 8, speed: 14, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "abyssal-sentinel", name: "Abyssal Sentinel", emoji: "\u{1F6E1}\uFE0F", requiredLevel: 40, hp: 180, attack: 32, defense: 20, speed: 5, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "mind-flayer", name: "Mind Flayer", emoji: "\u{1F9E0}", requiredLevel: 40, hp: 140, attack: 38, defense: 10, speed: 11, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "eldritch-eye", name: "Eldritch Eye", emoji: "\u{1F441}\uFE0F", requiredLevel: 40, hp: 130, attack: 40, defense: 8, speed: 13, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "void-knight", name: "Void Knight", emoji: "\u2694\uFE0F", requiredLevel: 40, hp: 200, attack: 42, defense: 22, speed: 7, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "chaos-weaver", name: "Chaos Weaver", emoji: "\u{1F578}\uFE0F", requiredLevel: 40, hp: 180, attack: 45, defense: 15, speed: 12, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "abyssal-horror", name: "Abyssal Horror", emoji: "\u{1F479}", requiredLevel: 40, hp: 250, attack: 48, defense: 20, speed: 10, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "void-dragon", name: "Void Dragon", emoji: "\u{1F409}", requiredLevel: 40, hp: 350, attack: 50, defense: 25, speed: 9, rewardMin: 0, rewardMax: 0, xpReward: 0 },
  { id: "the-ancient-one", name: "The Ancient One", emoji: "\u{1F300}", requiredLevel: 40, hp: 600, attack: 55, defense: 30, speed: 15, rewardMin: 0, rewardMax: 0, xpReward: 0 },
];

export function getDungeonMonster(id: string): MonsterDefinition | undefined {
  return DUNGEON_MONSTERS.find((m) => m.id === id);
}

// ── Dungeon Definitions ─────────────────────────────────

export const DUNGEONS: DungeonDefinition[] = [
  {
    id: "goblin-cave", name: "Goblin Cave", emoji: "\u{1F573}\uFE0F",
    requiredLevel: 0, floors: 3,
    description: "A dank cave crawling with goblins and vermin.",
    floorConfigs: {
      1: { normals: ["cave-rat", "cave-bat"], boss: "goblin-grunt", roomCount: 3 },
      2: { normals: ["goblin-grunt", "cave-bat"], boss: "goblin-shaman", roomCount: 3 },
      3: { normals: ["goblin-shaman", "goblin-grunt"], boss: "goblin-chief", roomCount: 4 },
    },
    baseCoinsPerFloor: 30, baseXpPerFloor: 20, completionBonus: 1.5,
  },
  {
    id: "skeleton-crypt", name: "Skeleton Crypt", emoji: "\u{1F480}",
    requiredLevel: 8, floors: 4,
    description: "Ancient bones stir in the forgotten crypt.",
    floorConfigs: {
      1: { normals: ["bone-rattler", "tomb-spider"], boss: "skeleton-knight", roomCount: 3 },
      2: { normals: ["skeleton-knight", "tomb-spider"], boss: "skeletal-archer", roomCount: 4 },
      3: { normals: ["skeletal-archer", "bone-rattler"], boss: "bone-mage", roomCount: 4 },
      4: { normals: ["bone-mage", "skeletal-archer"], boss: "crypt-lord", roomCount: 5 },
    },
    baseCoinsPerFloor: 60, baseXpPerFloor: 40, completionBonus: 1.75,
  },
  {
    id: "dark-forest", name: "Dark Forest", emoji: "\u{1F332}",
    requiredLevel: 18, floors: 5,
    description: "Shadows twist between the corrupted trees.",
    floorConfigs: {
      1: { normals: ["shadow-wolf", "venomous-vine"], boss: "forest-troll", roomCount: 4 },
      2: { normals: ["forest-troll", "shadow-stalker"], boss: "corrupted-treant", roomCount: 4 },
      3: { normals: ["corrupted-treant", "shadow-stalker"], boss: "dark-druid", roomCount: 5 },
      4: { normals: ["dark-druid", "shadow-wolf"], boss: "shadow-beast", roomCount: 5 },
      5: { normals: ["shadow-beast", "corrupted-treant"], boss: "forest-wraith", roomCount: 6 },
    },
    baseCoinsPerFloor: 120, baseXpPerFloor: 65, completionBonus: 2,
  },
  {
    id: "fire-caverns", name: "Fire Caverns", emoji: "\u{1F525}",
    requiredLevel: 30, floors: 5,
    description: "Rivers of lava illuminate the scorching tunnels.",
    floorConfigs: {
      1: { normals: ["magma-slug", "fire-imp"], boss: "lava-golem", roomCount: 4 },
      2: { normals: ["lava-golem", "infernal-hound"], boss: "ember-wyrm", roomCount: 5 },
      3: { normals: ["ember-wyrm", "fire-imp"], boss: "flame-sorcerer", roomCount: 5 },
      4: { normals: ["flame-sorcerer", "infernal-hound"], boss: "magma-titan", roomCount: 6 },
      5: { normals: ["magma-titan", "ember-wyrm"], boss: "inferno-drake", roomCount: 6 },
    },
    baseCoinsPerFloor: 250, baseXpPerFloor: 100, completionBonus: 2.25,
  },
  {
    id: "abyssal-depths", name: "Abyssal Depths", emoji: "\u{1F30A}",
    requiredLevel: 40, floors: 6,
    description: "Unfathomable horrors lurk in the endless dark.",
    floorConfigs: {
      1: { normals: ["deep-lurker", "void-shade"], boss: "abyssal-sentinel", roomCount: 5 },
      2: { normals: ["abyssal-sentinel", "mind-flayer"], boss: "eldritch-eye", roomCount: 5 },
      3: { normals: ["eldritch-eye", "void-shade"], boss: "void-knight", roomCount: 6 },
      4: { normals: ["void-knight", "chaos-weaver"], boss: "abyssal-horror", roomCount: 6 },
      5: { normals: ["abyssal-horror", "chaos-weaver"], boss: "void-dragon", roomCount: 7 },
      6: { normals: ["void-dragon", "abyssal-horror"], boss: "the-ancient-one", roomCount: 7 },
    },
    baseCoinsPerFloor: 500, baseXpPerFloor: 180, completionBonus: 2.5,
  },
];

export function getDungeon(dungeonId: string): DungeonDefinition | undefined {
  return DUNGEONS.find((d) => d.id === dungeonId);
}

export function getAvailableDungeons(playerLevel: number): DungeonDefinition[] {
  return DUNGEONS.filter((d) => playerLevel >= d.requiredLevel);
}

// ── Session CRUD ────────────────────────────────────────

function dungeonKey(guildId: string, userId: string): string {
  return `dungeon:${guildId}:${userId}`;
}

export const dungeon = {
  async getSession(guildId: string, userId: string): Promise<DungeonSession | null> {
    return await kv.get<DungeonSession>(dungeonKey(guildId, userId));
  },

  async createSession(
    guildId: string,
    userId: string,
    dungeonDef: DungeonDefinition,
    playerStats: DerivedCombatStats,
    dungeonInventory: InventorySlot[],
  ): Promise<DungeonSession> {
    const floorConfig = dungeonDef.floorConfigs[1];
    const monster = spawnMonster(floorConfig, 1, floorConfig.roomCount);

    const session: DungeonSession = {
      guildId, userId,
      dungeonId: dungeonDef.id,
      currentFloor: 1,
      currentRoom: 1,
      totalRoomsOnFloor: floorConfig.roomCount,
      combat: {
        monster,
        monsterHp: monster.hp,
        monsterMaxHp: monster.hp,
        isBoss: 1 === floorConfig.roomCount,
        berserkActive: false,
        shieldActive: false,
      },
      playerHp: playerStats.maxHp,
      playerMaxHp: playerStats.maxHp,
      playerStats,
      activeBuffs: [],
      dungeonInventory: dungeonInventory.map((s) => ({ ...s })),
      accumulatedCoins: 0,
      accumulatedXp: 0,
      floorCleared: false,
      floorsCompleted: 0,
      status: "combat",
      turn: 0,
      log: [],
      createdAt: Date.now(),
    };

    await kv.set(dungeonKey(guildId, userId), session);
    return session;
  },

  async updateSession(session: DungeonSession): Promise<void> {
    await kv.set(dungeonKey(session.guildId, session.userId), session);
  },

  async deleteSession(guildId: string, userId: string): Promise<void> {
    await kv.delete(dungeonKey(guildId, userId));
  },
};

// ── Monster Spawning ────────────────────────────────────

function spawnMonster(
  floorConfig: { normals: string[]; boss: string; roomCount: number },
  room: number,
  totalRooms: number,
): MonsterDefinition {
  if (room === totalRooms) {
    return getDungeonMonster(floorConfig.boss)!;
  }
  const idx = secureRandomIndex(floorConfig.normals.length);
  return getDungeonMonster(floorConfig.normals[idx])!;
}

// ── Floor Rewards ───────────────────────────────────────

function randomVariance(): number {
  // 0.8 to 1.2 variance
  return 0.8 + (secureRandomIndex(41) / 100);
}

export function calculateFloorReward(
  dungeonDef: DungeonDefinition,
  floor: number,
): { coins: number; xp: number } {
  const coins = Math.floor(dungeonDef.baseCoinsPerFloor * floor * randomVariance());
  const xpReward = dungeonDef.baseXpPerFloor * floor;
  return { coins, xp: xpReward };
}

// ── Buff Helpers ────────────────────────────────────────

function getDamageBoostMultiplier(buffs: ActiveBuff[]): number {
  for (const b of buffs) {
    if (b.type === "damage-boost" && b.turnsRemaining > 0) return b.value;
  }
  return 1;
}

function getShieldReduction(buffs: ActiveBuff[]): number {
  for (const b of buffs) {
    if (b.type === "shield" && b.turnsRemaining > 0) return b.value;
  }
  return 0;
}

function hasRevive(buffs: ActiveBuff[]): ActiveBuff | undefined {
  return buffs.find((b) => b.type === "revive" && b.turnsRemaining > 0);
}

function tickBuffs(buffs: ActiveBuff[]): ActiveBuff[] {
  return buffs
    .map((b) => ({ ...b, turnsRemaining: b.turnsRemaining - 1 }))
    .filter((b) => b.turnsRemaining > 0);
}

// ── Turn Resolution ─────────────────────────────────────

export type DungeonAction = "attack" | "defend" | "skill" | "item";

export interface DungeonTurnResult {
  session: DungeonSession;
  ended: boolean;
  monsterDefeated: boolean;
  floorCleared: boolean;
  dungeonComplete: boolean;
}

export function resolveDungeonTurn(
  session: DungeonSession,
  action: DungeonAction,
  skillEffect?: CombatSkillEffect,
  itemId?: ConsumableItemId,
): DungeonTurnResult {
  const combat = session.combat!;
  session.turn++;
  session.log = [];

  // Clear previous-turn flags
  const wasBerserk = combat.berserkActive;
  combat.berserkActive = false;
  combat.shieldActive = false;

  // ── Item action ──
  if (action === "item" && itemId) {
    const slot = session.dungeonInventory.find((s) => s.itemId === itemId);
    if (slot && slot.quantity > 0) {
      const itemDef = getConsumableItem(itemId);
      if (itemDef) {
        applyItemEffect(session, itemDef);
        slot.quantity--;
        if (slot.quantity === 0) {
          session.dungeonInventory = session.dungeonInventory.filter((s) => s.itemId !== itemId);
        }
        session.log.push(`You used **${itemDef.name}** ${itemDef.emoji}!`);
      }
    }
    // Monster still attacks after item use
    const monsterDmg = calcMonsterDamage(session, wasBerserk);
    session.playerHp = Math.max(0, session.playerHp - monsterDmg);
    session.log.push(`${combat.monster.name} attacks you for **${monsterDmg}** damage!`);

    if (session.playerHp <= 0) {
      const reviveBuff = hasRevive(session.activeBuffs);
      if (reviveBuff) {
        session.playerHp = Math.max(1, Math.floor(session.playerMaxHp * reviveBuff.value));
        session.activeBuffs = session.activeBuffs.filter((b) => b !== reviveBuff);
        session.log.push(`**Revive Charm** activates! You're restored to **${session.playerHp}** HP!`);
      } else {
        session.status = "defeat";
        return { session, ended: true, monsterDefeated: false, floorCleared: false, dungeonComplete: false };
      }
    }

    session.activeBuffs = tickBuffs(session.activeBuffs);
    return { session, ended: false, monsterDefeated: false, floorCleared: false, dungeonComplete: false };
  }

  // ── Defend ──
  if (action === "defend") {
    combat.shieldActive = true;
    session.log.push("You brace for impact! (50% damage reduction)");
  }

  // ── Skill ──
  let playerDamageMultiplier = getDamageBoostMultiplier(session.activeBuffs);
  let skipPlayerAttack = false;

  if (action === "skill" && skillEffect) {
    switch (skillEffect) {
      case "power-strike":
        playerDamageMultiplier *= 1.5;
        session.log.push("You use **Power Strike**!");
        break;
      case "shield-wall":
        combat.shieldActive = true;
        skipPlayerAttack = true;
        session.log.push("You raise a **Shield Wall**! (75% damage reduction)");
        break;
      case "quick-strike": {
        const qs = calculateDamage(session.playerStats.attack, combat.monster.defense);
        const boostedQs = Math.ceil(qs * playerDamageMultiplier);
        combat.monsterHp = Math.max(0, combat.monsterHp - boostedQs);
        session.log.push(`You use **Quick Strike** for **${boostedQs}** damage!`);
        if (combat.monsterHp <= 0) {
          return handleMonsterDefeat(session);
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
        playerDamageMultiplier *= 2.5;
        combat.berserkActive = true;
        session.log.push("You enter a **Berserk** rage!");
        break;
    }
  }

  // ── Turn order by speed ──
  const playerGoesFirst = session.playerStats.speed >= combat.monster.speed;

  if (playerGoesFirst) {
    if (!skipPlayerAttack && action !== "defend") {
      const result = playerAttacks(session, playerDamageMultiplier);
      if (result) return result;
    }
    const result = monsterAttacks(session, wasBerserk);
    if (result) return result;
  } else {
    const result = monsterAttacks(session, wasBerserk);
    if (result) return result;
    if (!skipPlayerAttack && action !== "defend") {
      const pResult = playerAttacks(session, playerDamageMultiplier);
      if (pResult) return pResult;
    }
  }

  session.activeBuffs = tickBuffs(session.activeBuffs);
  return { session, ended: false, monsterDefeated: false, floorCleared: false, dungeonComplete: false };
}

function playerAttacks(session: DungeonSession, multiplier: number): DungeonTurnResult | null {
  const combat = session.combat!;
  const rawDmg = calculateDamage(session.playerStats.attack, combat.monster.defense);
  const dmg = Math.ceil(rawDmg * multiplier);
  combat.monsterHp = Math.max(0, combat.monsterHp - dmg);
  session.log.push(`You attack ${combat.monster.name} for **${dmg}** damage!`);
  if (combat.monsterHp <= 0) {
    return handleMonsterDefeat(session);
  }
  return null;
}

function calcMonsterDamage(session: DungeonSession, wasBerserk: boolean): number {
  const combat = session.combat!;
  const rawDmg = calculateDamage(combat.monster.attack, session.playerStats.defense);
  let dmg = wasBerserk ? Math.ceil(rawDmg * 1.5) : rawDmg;
  const shieldReduction = getShieldReduction(session.activeBuffs);
  if (combat.shieldActive || shieldReduction > 0) {
    const reduction = combat.shieldActive
      ? Math.max(shieldReduction, session.playerStats.unlockedSkills.some((s) => s.effect === "shield-wall") && combat.shieldActive ? 0.5 : 0.5)
      : shieldReduction;
    dmg = Math.ceil(dmg * (1 - reduction));
  }
  return dmg;
}

function monsterAttacks(session: DungeonSession, wasBerserk: boolean): DungeonTurnResult | null {
  const combat = session.combat!;
  const monsterDmg = calcMonsterDamage(session, wasBerserk);
  session.playerHp = Math.max(0, session.playerHp - monsterDmg);
  session.log.push(`${combat.monster.name} attacks you for **${monsterDmg}** damage!`);

  if (session.playerHp <= 0) {
    const reviveBuff = hasRevive(session.activeBuffs);
    if (reviveBuff) {
      session.playerHp = Math.max(1, Math.floor(session.playerMaxHp * reviveBuff.value));
      session.activeBuffs = session.activeBuffs.filter((b) => b !== reviveBuff);
      session.log.push(`**Revive Charm** activates! You're restored to **${session.playerHp}** HP!`);
      return null;
    }
    session.status = "defeat";
    return { session, ended: true, monsterDefeated: false, floorCleared: false, dungeonComplete: false };
  }
  return null;
}

function handleMonsterDefeat(session: DungeonSession): DungeonTurnResult {
  const combat = session.combat!;
  const dungeonDef = getDungeon(session.dungeonId)!;
  session.log.push(`You defeated **${combat.monster.name}**!`);

  if (combat.isBoss) {
    // Floor cleared
    const reward = calculateFloorReward(dungeonDef, session.currentFloor);
    session.accumulatedCoins += reward.coins;
    session.accumulatedXp += reward.xp;
    session.floorCleared = true;
    session.floorsCompleted++;
    session.log.push(`Floor **${session.currentFloor}** cleared! +${reward.coins} coins, +${reward.xp} XP`);

    if (session.currentFloor >= dungeonDef.floors) {
      // Dungeon complete
      session.status = "victory";
      const bonusCoins = Math.floor(session.accumulatedCoins * (dungeonDef.completionBonus - 1));
      const bonusXp = Math.floor(session.accumulatedXp * (dungeonDef.completionBonus - 1));
      session.accumulatedCoins += bonusCoins;
      session.accumulatedXp += bonusXp;
      session.log.push(`Dungeon complete! Completion bonus: +${bonusCoins} coins, +${bonusXp} XP!`);
      return { session, ended: true, monsterDefeated: true, floorCleared: true, dungeonComplete: true };
    }

    session.status = "floor-cleared";
    return { session, ended: false, monsterDefeated: true, floorCleared: true, dungeonComplete: false };
  }

  // Normal monster defeated — auto-advance to next room
  session.currentRoom++;
  const floorConfig = dungeonDef.floorConfigs[session.currentFloor];
  const nextMonster = spawnMonster(floorConfig, session.currentRoom, session.totalRoomsOnFloor);
  session.combat = {
    monster: nextMonster,
    monsterHp: nextMonster.hp,
    monsterMaxHp: nextMonster.hp,
    isBoss: session.currentRoom === session.totalRoomsOnFloor,
    berserkActive: false,
    shieldActive: false,
  };
  const bossTag = session.currentRoom === session.totalRoomsOnFloor ? " **[BOSS]**" : "";
  session.log.push(`Room ${session.currentRoom}/${session.totalRoomsOnFloor}: **${nextMonster.name}** ${nextMonster.emoji} appears!${bossTag}`);

  session.activeBuffs = tickBuffs(session.activeBuffs);
  return { session, ended: false, monsterDefeated: true, floorCleared: false, dungeonComplete: false };
}

// ── Floor Advancement ───────────────────────────────────

export function advanceFloor(session: DungeonSession): void {
  const dungeonDef = getDungeon(session.dungeonId)!;
  const nextFloor = session.currentFloor + 1;
  const floorConfig = dungeonDef.floorConfigs[nextFloor];

  session.currentFloor = nextFloor;
  session.currentRoom = 1;
  session.totalRoomsOnFloor = floorConfig.roomCount;
  session.floorCleared = false;
  session.status = "combat";

  const monster = spawnMonster(floorConfig, 1, floorConfig.roomCount);
  session.combat = {
    monster,
    monsterHp: monster.hp,
    monsterMaxHp: monster.hp,
    isBoss: 1 === floorConfig.roomCount,
    berserkActive: false,
    shieldActive: false,
  };

  session.log = [`Floor **${nextFloor}** — ${monster.name} ${monster.emoji} appears!`];
}

// ── Item Effect Application ─────────────────────────────

function applyItemEffect(session: DungeonSession, item: { effect: import("./types.ts").ItemEffect }): void {
  const effect = item.effect;
  switch (effect.type) {
    case "heal":
      session.playerHp = Math.min(session.playerMaxHp, session.playerHp + effect.amount);
      break;
    case "heal-percent":
      session.playerHp = Math.min(
        session.playerMaxHp,
        session.playerHp + Math.floor(session.playerMaxHp * effect.percent),
      );
      break;
    case "damage-boost":
      session.activeBuffs.push({ type: "damage-boost", value: effect.multiplier, turnsRemaining: effect.turns });
      break;
    case "shield":
      session.activeBuffs.push({ type: "shield", value: effect.reduction, turnsRemaining: effect.turns });
      break;
    case "cleanse":
      session.activeBuffs = session.activeBuffs.filter((b) => b.type !== "shield");
      break;
    case "revive":
      session.activeBuffs.push({ type: "revive", value: effect.hpPercent, turnsRemaining: 999 });
      break;
  }
}

export const _internals = {
  dungeonKey, spawnMonster, randomVariance, applyItemEffect,
  getDamageBoostMultiplier, getShieldReduction, hasRevive, tickBuffs,
  calcMonsterDamage,
};
