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

export type ActivityType = "blackjack" | "crash" | "mines" | "hilo" | "poker";

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

export type GameName =
  | "coinflip" | "dice" | "slots" | "roulette" | "blackjack"
  | "crash" | "mines" | "limbo" | "plinko" | "keno"
  | "hilo" | "poker" | "war" | "horserace"
  | "duel" | "rps" | "russianroulette" | "trivia"
  | "connect4" | "tictactoe";

export const ALL_GAME_NAMES: GameName[] = [
  "coinflip", "dice", "slots", "roulette", "blackjack",
  "crash", "mines", "limbo", "plinko", "keno",
  "hilo", "poker", "war", "horserace",
  "duel", "rps", "russianroulette", "trivia",
  "connect4", "tictactoe",
];

export interface GamesGuildConfig {
  guildId: string;
  currencyName: string;
  currencyEmoji: string;
  casinoEnabled: boolean;
  casinoMaxBet: number;
  casinoMinBet: number;
  startingBalance: number;
  disabledGames: string[];
  dailyEnabled: boolean;
  dailyMin: number;
  dailyMax: number;
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

// ── Crash ────────────────────────────────────────────────

export interface CrashSession {
  guildId: string;
  userId: string;
  bet: number;
  crashPoint: number;
  currentMultiplier: number;
  currentStep: number;
  status: "playing" | "done";
  createdAt: number;
}

// ── Mines ────────────────────────────────────────────────

export interface MinesSession {
  guildId: string;
  userId: string;
  bet: number;
  mineCount: number;
  grid: boolean[]; // true = mine, 20 cells (4x5)
  revealed: boolean[];
  safePicks: number;
  currentMultiplier: number;
  status: "playing" | "done";
  createdAt: number;
}

// ── Hi-Lo ────────────────────────────────────────────────

export interface HiLoSession {
  guildId: string;
  userId: string;
  bet: number;
  currentCard: Card;
  deck: Card[];
  streak: number;
  currentMultiplier: number;
  status: "playing" | "done";
  createdAt: number;
}

// ── Video Poker ──────────────────────────────────────────

export interface PokerSession {
  guildId: string;
  userId: string;
  bet: number;
  hand: Card[];
  deck: Card[];
  held: boolean[];
  phase: "hold" | "done";
  status: "playing" | "done";
  createdAt: number;
}

// ── Duel ─────────────────────────────────────────────────

export interface DuelSession {
  guildId: string;
  challengerId: string;
  targetId: string;
  channelId: string;
  bet: number;
  status: "pending" | "done";
  createdAt: number;
}

// ── Rock Paper Scissors ─────────────────────────────

export interface RpsSession {
  guildId: string;
  challengerId: string;
  targetId: string;
  channelId: string;
  bet: number;
  rounds: 1 | 3 | 5;
  currentRound: number;
  challengerWins: number;
  targetWins: number;
  challengerChoice: "rock" | "paper" | "scissors" | null;
  targetChoice: "rock" | "paper" | "scissors" | null;
  status: "pending" | "picking" | "done";
  createdAt: number;
}

// ── Russian Roulette ────────────────────────────────

export interface RussianRouletteSession {
  guildId: string;
  hostId: string;
  channelId: string;
  bet: number;
  players: string[];
  alivePlayers: string[];
  currentTurn: number;
  loadedChamber: number;
  status: "lobby" | "playing" | "done";
  createdAt: number;
}

// ── Trivia ──────────────────────────────────────────

export interface TriviaSession {
  guildId: string;
  hostId: string;
  bet: number;
  question: string;
  choices: string[];
  correctIndex: number;
  category: string;
  answeredBy: string | null;
  status: "active" | "done";
  createdAt: number;
}

// ── Connect Four ────────────────────────────────────

export interface Connect4Session {
  guildId: string;
  challengerId: string;
  targetId: string;
  channelId: string;
  bet: number;
  board: number[][];
  currentPlayer: 1 | 2;
  status: "pending" | "playing" | "done";
  createdAt: number;
}

// ── Tic-Tac-Toe ─────────────────────────────────────

export interface TicTacToeSession {
  guildId: string;
  challengerId: string;
  targetId: string;
  channelId: string;
  bet: number;
  board: number[];
  currentPlayer: 1 | 2;
  status: "pending" | "playing" | "done";
  createdAt: number;
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
