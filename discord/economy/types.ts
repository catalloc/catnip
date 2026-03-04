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

export type ShopItemType = "job-upgrade" | "cosmetic-role" | "custom";

export interface ShopItem {
  id: string;
  type: ShopItemType;
  name: string;
  description: string;
  price: number;
  unlocksJobTier?: JobTierId;
  roleId?: string;
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
  startingBalance: number;
  createdAt: number;
  updatedAt: number;
}
