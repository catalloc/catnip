/**
 * discord/games/types.ts
 *
 * All interfaces and type definitions for the games system.
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

export type ActivityType = "blackjack";

export interface ActivityLock {
  activityType: ActivityType;
  details?: string;
  startedAt: number;
  expiresAt: number;
}

// ── Shop ──────────────────────────────────────────────────

export type ShopItemType = "cosmetic-role" | "custom" | "profile-title" | "profile-badge" | "profile-border";

export interface ShopItem {
  id: string;
  type: ShopItemType;
  name: string;
  description: string;
  price: number;
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

// ── Guild Games Config ──────────────────────────────────

export interface GamesGuildConfig {
  guildId: string;
  currencyName: string;
  currencyEmoji: string;
  casinoEnabled: boolean;
  casinoMaxBet: number;
  casinoMinBet: number;
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
