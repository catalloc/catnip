/**
 * discord/economy/types.ts
 *
 * All interfaces and type definitions for the economy system.
 */

// ── Accounts ──────────────────────────────────────────────

export interface EconomyAccount {
  userId: string;
  guildId: string;
  balance: number;
  lifetimeEarned: number;
  createdAt: number;
  updatedAt: number;
}

// ── Activity Lock ────────────────────────────────────────

export type ActivityType = "farm" | "mine" | "forage" | "job" | "train" | "arena" | "blackjack" | "adventure";

export interface ActivityLock {
  activityType: ActivityType;
  details?: string;
  startedAt: number;
  expiresAt: number;
}

// ── Jobs ──────────────────────────────────────────────────

export type JobTierId =
  | "unemployed"
  | "burger-flipper"
  | "cashier"
  | "mechanic"
  | "chef"
  | "programmer"
  | "doctor"
  | "lawyer"
  | "ceo"
  | "mafia-boss";

export interface JobTierConfig {
  id: JobTierId;
  name: string;
  hourlyRate: number;
  shopPrice: number;
  shiftDurationMs: number;
  shiftPayout: number;
}

export interface JobShiftState {
  userId: string;
  guildId: string;
  tierId: JobTierId;
  startedAt: number;
  readyAt: number;
  collected: boolean;
}

export interface JobState {
  userId: string;
  guildId: string;
  tierId: JobTierId;
  lastCollectedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ── Crime ─────────────────────────────────────────────────

export type CrimeId = "pickpocket" | "shoplifting" | "carjacking" | "bank-robbery" | "heist";

export interface CrimeDefinition {
  id: CrimeId;
  name: string;
  successRate: number;
  rewardMin: number;
  rewardMax: number;
  fineMin: number;
  fineMax: number;
  cooldownMs: number;
  requiredLevel: number;
}

export interface CrimeState {
  userId: string;
  guildId: string;
  lastCrimeAt: number;
  nextCrimeAt: number;
  totalAttempts: number;
  totalSuccesses: number;
}

// ── Shop ──────────────────────────────────────────────────

export type ShopItemType = "job-upgrade" | "cosmetic-role" | "custom" | "profile-title" | "profile-badge" | "profile-border" | "weapon" | "carry-limit-upgrade";

export type WeaponType = "sword" | "bow" | "magic";

export interface ShopItem {
  id: string;
  type: ShopItemType;
  name: string;
  description: string;
  price: number;
  unlocksJobTier?: JobTierId;
  roleId?: string;
  requiredLevel?: number;
  profileTitle?: string;
  profileBadge?: string;
  profileBorderColor?: number;
  weaponId?: string;
  weaponDamage?: number;
  weaponType?: WeaponType;
  carryLimitValue?: number;
  enabled: boolean;
}

export interface ShopCatalog {
  guildId: string;
  items: ShopItem[];
  updatedAt: number;
}

// ── Casino ────────────────────────────────────────────────

export interface Card {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: string;
  value: number;
}

export interface BlackjackSession {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  bet: number;
  playerHand: Card[];
  dealerHand: Card[];
  deck: Card[];
  status: "playing" | "standing" | "done";
  createdAt: number;
}

// ── Guild Economy Config ──────────────────────────────────

export interface EconomyGuildConfig {
  guildId: string;
  currencyName: string;
  currencyEmoji: string;
  casinoEnabled: boolean;
  casinoMaxBet: number;
  casinoMinBet: number;
  jobsEnabled: boolean;
  crimeEnabled: boolean;
  crimeFineEnabled: boolean;
  farmEnabled: boolean;
  mineEnabled: boolean;
  forageEnabled: boolean;
  trainEnabled: boolean;
  arenaEnabled: boolean;
  adventureEnabled: boolean;
  startingBalance: number;
  createdAt: number;
  updatedAt: number;
}

// ── XP & Levels ──────────────────────────────────────────

export interface XpState {
  userId: string;
  guildId: string;
  xp: number;
  level: number;
  totalXpEarned: number;
  createdAt: number;
  updatedAt: number;
}

// ── Idle Actions ─────────────────────────────────────────

export type IdleActionType = "farm" | "mine" | "forage";

export interface IdleActionTier {
  id: string;
  name: string;
  requiredLevel: number;
  cooldownMs: number;
  rewardMin: number;
  rewardMax: number;
  xpReward: number;
  rareChance: number;
  rareMultiplier: number;
}

export interface IdleActionState {
  userId: string;
  guildId: string;
  actionType: IdleActionType;
  tierId: string;
  startedAt: number;
  readyAt: number;
  collected: boolean;
}

// ── Profile ──────────────────────────────────────────────

export interface ProfileData {
  userId: string;
  guildId: string;
  title?: string;
  badgeIds: string[];
  borderColor?: number;
  activeBadgeId?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Combat Stats ────────────────────────────────────────

export type TrainableAttribute = "strength" | "defense" | "speed" | "vitality";
export type WeaponMasteryType = "sword" | "bow" | "magic";
export type TrainableSkill = TrainableAttribute | WeaponMasteryType;

export interface CombatStats {
  userId: string;
  guildId: string;
  strength: number;
  defense: number;
  speed: number;
  vitality: number;
  swordMastery: number;
  bowMastery: number;
  magicMastery: number;
  equippedWeaponId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DerivedCombatStats {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  unlockedSkills: CombatSkill[];
}

// ── Training ────────────────────────────────────────────

export interface TrainingSession {
  userId: string;
  guildId: string;
  skill: TrainableSkill;
  startedAt: number;
  readyAt: number;
  collected: boolean;
}

// ── Combat Skills ───────────────────────────────────────

export type CombatSkillEffect = "power-strike" | "shield-wall" | "quick-strike" | "heal" | "berserk";

export interface CombatSkill {
  id: string;
  name: string;
  description: string;
  requiredAttribute: TrainableAttribute;
  requiredLevel: number;
  effect: CombatSkillEffect;
}

// ── Monsters & Arena ────────────────────────────────────

export interface MonsterDefinition {
  id: string;
  name: string;
  emoji: string;
  requiredLevel: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  rewardMin: number;
  rewardMax: number;
  xpReward: number;
}

export interface ArenaSession {
  guildId: string;
  userId: string;
  monster: MonsterDefinition;
  playerHp: number;
  playerMaxHp: number;
  monsterHp: number;
  monsterMaxHp: number;
  playerStats: DerivedCombatStats;
  turn: number;
  status: "active" | "victory" | "defeat" | "fled";
  berserkActive: boolean;
  shieldActive: boolean;
  log: string[];
  createdAt: number;
}

// ── Weapons ─────────────────────────────────────────────

export interface WeaponDefinition {
  id: string;
  name: string;
  damage: number;
  weaponType: WeaponType;
  requiredLevel: number;
}

// ── Consumable Items ───────────────────────────────────

export type ConsumableItemId =
  | "health-potion" | "greater-health-potion" | "mega-health-potion"
  | "damage-boost" | "greater-damage-boost"
  | "shield-potion" | "greater-shield-potion"
  | "antidote" | "revive-charm"
  | "bread" | "stew" | "feast";

export type ItemEffect =
  | { type: "heal"; amount: number }
  | { type: "heal-percent"; percent: number }
  | { type: "damage-boost"; multiplier: number; turns: number }
  | { type: "shield"; reduction: number; turns: number }
  | { type: "cleanse" }
  | { type: "revive"; hpPercent: number };

export interface ConsumableItemDefinition {
  id: ConsumableItemId;
  name: string;
  emoji: string;
  description: string;
  shopPrice: number | null;
  effect: ItemEffect;
}

// ── Inventory ──────────────────────────────────────────

export interface InventorySlot {
  itemId: ConsumableItemId;
  quantity: number;
}

export interface PlayerInventory {
  guildId: string;
  userId: string;
  items: InventorySlot[];
  carryLimit: number;
  updatedAt: number;
}

// ── Dungeons ───────────────────────────────────────────

export interface DungeonFloorConfig {
  normals: string[];
  boss: string;
  roomCount: number;
}

export interface DungeonDefinition {
  id: string;
  name: string;
  emoji: string;
  requiredLevel: number;
  floors: number;
  description: string;
  floorConfigs: Record<number, DungeonFloorConfig>;
  baseCoinsPerFloor: number;
  baseXpPerFloor: number;
  completionBonus: number;
}

export interface ActiveBuff {
  type: "damage-boost" | "shield" | "revive";
  value: number;
  turnsRemaining: number;
}

export interface DungeonCombatState {
  monster: MonsterDefinition;
  monsterHp: number;
  monsterMaxHp: number;
  isBoss: boolean;
  berserkActive: boolean;
  shieldActive: boolean;
}

export interface DungeonSession {
  guildId: string;
  userId: string;
  dungeonId: string;
  currentFloor: number;
  currentRoom: number;
  totalRoomsOnFloor: number;
  combat: DungeonCombatState | null;
  playerHp: number;
  playerMaxHp: number;
  playerStats: DerivedCombatStats;
  activeBuffs: ActiveBuff[];
  dungeonInventory: InventorySlot[];
  accumulatedCoins: number;
  accumulatedXp: number;
  floorCleared: boolean;
  floorsCompleted: number;
  status: "combat" | "floor-cleared" | "retreated" | "victory" | "defeat";
  turn: number;
  log: string[];
  createdAt: number;
}
