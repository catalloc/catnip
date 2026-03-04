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

export type ShopItemType = "job-upgrade" | "cosmetic-role" | "custom" | "profile-title" | "profile-badge" | "profile-border";

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
