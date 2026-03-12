/**
 * Games Command — Play casino games to win or lose coins
 *
 * File: discord/interactions/commands/games.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { activityLock } from "../../games/activity-lock.ts";
import { playCoinflip } from "../../games/casino/coinflip.ts";
import { playDice } from "../../games/casino/dice.ts";
import { playSlots } from "../../games/casino/slots.ts";
import { playRoulette } from "../../games/casino/roulette.ts";
import {
  blackjack, formatHand, handValue, isBlackjack, isBust,
  playDealerHand, determineOutcome, calculatePayout,
} from "../../games/casino/blackjack.ts";
import { crash, multiplierAtStep } from "../../games/casino/crash.ts";
import { mines, formatGrid, GRID_SIZE } from "../../games/casino/mines.ts";
import { playLimbo } from "../../games/casino/limbo.ts";
import { playPlinko } from "../../games/casino/plinko.ts";
import type { PlinkoRisk } from "../../games/casino/plinko.ts";
import { playKeno, parseKenoNumbers } from "../../games/casino/keno.ts";
import { hilo, cardEmoji as hiloCardEmoji, stepMultiplier } from "../../games/casino/hilo.ts";
import { poker, formatPokerHand } from "../../games/casino/poker.ts";
import { playWar, formatWarCard } from "../../games/casino/war.ts";
import { playHorseRace, HORSES, formatRace } from "../../games/casino/horserace.ts";
import { duels } from "../../games/casino/duels.ts";
import { rps, choiceEmoji } from "../../games/casino/rps.ts";
import { russianRoulette } from "../../games/casino/russian-roulette.ts";
import { trivia } from "../../games/casino/trivia.ts";
import { connect4, formatBoard as formatC4Board } from "../../games/casino/connect4.ts";
import { tictactoe } from "../../games/casino/tictactoe.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";
import { UserFacingError } from "../errors.ts";

// ── Helpers ──────────────────────────────────────────────

async function grantCasinoXp(guildId: string, userId: string, won: boolean): Promise<string> {
  const amount = won ? XP_AWARDS.CASINO_WIN : XP_AWARDS.CASINO_LOSS;
  const result = await xp.grantXp(guildId, userId, amount);
  let msg = ` (+${amount} XP)`;
  if (result.levelsGained > 0) msg += ` | :arrow_up: Level ${result.newLevel}!`;
  return msg;
}

const ABSOLUTE_MAX_BET = 1_000_000_000;

function validateBet(bet: number, balance: number, min: number, max: number): string | null {
  if (!Number.isFinite(bet) || bet !== Math.floor(bet) || bet <= 0) {
    return "Bet must be a positive whole number.";
  }
  if (bet > ABSOLUTE_MAX_BET) return "Bet exceeds absolute maximum.";
  if (bet < min) return `Minimum bet is **${min.toLocaleString()}**.`;
  if (bet > max) return `Maximum bet is **${max.toLocaleString()}**.`;
  if (bet > balance) return `You only have **${balance.toLocaleString()}** coins.`;
  return null;
}

function assertChoice<T extends string>(value: unknown, valid: T[], label: string): T {
  if (typeof value === "string" && (valid as string[]).includes(value)) return value as T;
  throw new UserFacingError(`Invalid ${label}.`);
}

// Activity-locked games that need acquireLock
const LOCKED_GAMES = new Set(["blackjack", "crash", "mines", "hilo", "poker"]);

export default defineCommand({
  name: "games",
  description: "Play casino games to win or lose coins",

  options: [
    // ── Existing games ──
    {
      name: "coinflip",
      description: "Flip a coin — 2x payout",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        {
          name: "call", description: "Heads or tails", type: OptionTypes.STRING, required: true,
          choices: [{ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }],
        },
      ],
    },
    {
      name: "dice",
      description: "Roll a die — pick a number for 5x payout",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        {
          name: "number", description: "Pick a number (1-6)", type: OptionTypes.INTEGER, required: true,
          choices: [
            { name: "1", value: 1 }, { name: "2", value: 2 }, { name: "3", value: 3 },
            { name: "4", value: 4 }, { name: "5", value: 5 }, { name: "6", value: 6 },
          ],
        },
      ],
    },
    {
      name: "slots",
      description: "Spin the slot machine",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "roulette",
      description: "Spin the roulette wheel",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        {
          name: "type", description: "Bet type", type: OptionTypes.STRING, required: true,
          choices: [
            { name: "Red", value: "red" }, { name: "Black", value: "black" },
            { name: "Number", value: "number" },
          ],
        },
        { name: "number", description: "Number to bet on (0-36, for number bets)", type: OptionTypes.INTEGER, required: false },
      ],
    },
    {
      name: "blackjack",
      description: "Play blackjack — hit, stand, or double down",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },

    // ── New games ──
    {
      name: "crash",
      description: "Multiplier climbs — cash out before it crashes!",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "mines",
      description: "Reveal safe cells in a minefield for increasing payouts",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        { name: "mines", description: "Number of mines (1-19)", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "limbo",
      description: "Pick a target multiplier — high risk, high reward",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        { name: "target", description: "Target multiplier (1.1 - 100)", type: OptionTypes.NUMBER, required: true },
      ],
    },
    {
      name: "plinko",
      description: "Drop a ball through pegs into multiplier slots",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        {
          name: "risk", description: "Risk level", type: OptionTypes.STRING, required: true,
          choices: [
            { name: "Low", value: "low" }, { name: "Medium", value: "medium" }, { name: "High", value: "high" },
          ],
        },
      ],
    },
    {
      name: "keno",
      description: "Pick numbers and hope they match the draw",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        { name: "numbers", description: "Pick 1-10 numbers from 1-40 (comma-separated)", type: OptionTypes.STRING, required: true },
      ],
    },
    {
      name: "hilo",
      description: "Guess higher or lower — chain correct guesses",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "poker",
      description: "Video poker — Jacks or Better",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "war",
      description: "Card war — higher card wins",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "horserace",
      description: "Pick a horse and watch them race",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
        {
          name: "horse", description: "Pick a horse", type: OptionTypes.INTEGER, required: true,
          choices: HORSES.map((h) => ({ name: `${h.name} (${h.payout}x)`, value: h.number })),
        },
      ],
    },
    {
      name: "duel",
      description: "Challenge another player to a coinflip duel",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "target", description: "Player to challenge", type: OptionTypes.USER, required: true },
        { name: "bet", description: "Amount to wager", type: OptionTypes.INTEGER, required: true },
      ],
    },

    // ── Social / Multiplayer games ──
    {
      name: "rps",
      description: "Rock Paper Scissors — challenge a player",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "target", description: "Player to challenge", type: OptionTypes.USER, required: true },
        { name: "bet", description: "Amount to wager", type: OptionTypes.INTEGER, required: true },
        {
          name: "rounds", description: "Best of 1, 3, or 5", type: OptionTypes.INTEGER, required: false,
          choices: [
            { name: "Best of 1", value: 1 },
            { name: "Best of 3", value: 3 },
            { name: "Best of 5", value: 5 },
          ],
        },
      ],
    },
    {
      name: "russianroulette",
      description: "Russian Roulette — 2-6 players, last one standing wins",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Buy-in amount per player", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "trivia",
      description: "Answer a trivia question — anyone can answer!",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "bet", description: "Amount to bet", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "connect4",
      description: "Connect Four — drop pieces, get 4 in a row",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "target", description: "Player to challenge", type: OptionTypes.USER, required: true },
        { name: "bet", description: "Amount to wager", type: OptionTypes.INTEGER, required: true },
      ],
    },
    {
      name: "tictactoe",
      description: "Tic-Tac-Toe — classic 3x3 grid game",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        { name: "target", description: "Player to challenge", type: OptionTypes.USER, required: true },
        { name: "bet", description: "Amount to wager", type: OptionTypes.INTEGER, required: true },
      ],
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;
    const config = await gamesConfig.get(guildId);

    if (!config.casinoEnabled) {
      return { success: false, error: "The casino is closed in this server." };
    }

    if (sub && (config.disabledGames ?? []).includes(sub)) {
      return { success: false, error: `**${sub}** is disabled in this server.` };
    }

    // PvP games handle debit/locking separately
    const PVP_GAMES = new Set(["duel", "rps", "connect4", "tictactoe", "russianroulette"]);

    // Activity lock: multi-turn games acquire, instant games just check
    if (sub && LOCKED_GAMES.has(sub)) {
      const lockResult = await activityLock.acquireLock(guildId, userId, sub as any);
      if (!lockResult.success) return { success: false, error: lockResult.error };
    } else if (sub && !PVP_GAMES.has(sub)) {
      const lockCheck = await activityLock.requireNoActivity(guildId, userId);
      if (!lockCheck.allowed) return { success: false, error: lockCheck.error };
    }

    const bet = options?.bet as number;
    const account = await accounts.getOrCreate(guildId, userId);
    const betError = validateBet(bet, account.balance, config.casinoMinBet, config.casinoMaxBet);
    if (betError) {
      if (sub && LOCKED_GAMES.has(sub)) await activityLock.releaseLock(guildId, userId);
      return { success: false, error: betError };
    }

    // Debit first (except PvP games which handle debit specially)
    if (sub && !PVP_GAMES.has(sub)) {
      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) {
        if (sub && LOCKED_GAMES.has(sub)) await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "Insufficient funds." };
      }
    }

    // ── Coinflip ─────────────────────────────────────────
    if (sub === "coinflip") {
      const call = assertChoice(options?.call, ["heads", "tails"], "coin call");
      const result = playCoinflip(bet, call);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const e = embed()
        .title(`${config.currencyEmoji} Coin Flip`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `You called **${result.choice}** — it landed on **${result.result}**!\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Dice ─────────────────────────────────────────────
    if (sub === "dice") {
      const number = options?.number as number;
      const result = playDice(bet, number);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const e = embed()
        .title(`${config.currencyEmoji} Dice Roll`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `You picked **${result.choice}** — the die rolled **${result.rolled}**!\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Slots ────────────────────────────────────────────
    if (sub === "slots") {
      const result = playSlots(bet);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const reelLine = `[ ${result.reels.join(" | ")} ]`;
      const e = embed()
        .title(`${config.currencyEmoji} Slot Machine`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `${reelLine}\n\n` +
          (result.won
            ? `**${result.multiplier}x** — You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `No match — you lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Roulette ─────────────────────────────────────────
    if (sub === "roulette") {
      const betType = assertChoice(options?.type, ["red", "black", "number"], "bet type");
      const number = (options?.number as number) ?? 0;
      if (betType === "number" && (number < 0 || number > 36)) {
        await accounts.creditBalance(guildId, userId, bet);
        return { success: false, error: "Number must be between 0 and 36." };
      }
      const result = playRoulette(bet, betType, number);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const colorEmoji = result.landedColor === "red" ? ":red_circle:" : result.landedColor === "black" ? ":black_circle:" : ":green_circle:";
      const e = embed()
        .title(`${config.currencyEmoji} Roulette`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `The ball landed on ${colorEmoji} **${result.landed}**!\n` +
          `You bet on **${result.betValue}**.\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Blackjack ────────────────────────────────────────
    if (sub === "blackjack") {
      const existing = await blackjack.getSession(guildId, userId);
      if (existing) {
        await accounts.creditBalance(guildId, userId, bet);
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active blackjack game! Use the buttons to play." };
      }

      const session = await blackjack.createSession(guildId, userId, "", "", bet);

      if (isBlackjack(session.playerHand)) {
        const finalSession = playDealerHand(session);
        const outcome = determineOutcome(finalSession);
        const payout = calculatePayout(bet, outcome);
        const bjWon = outcome !== "loss" && outcome !== "dealer-blackjack";
        if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
        await blackjack.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);
        const xpMsg = await grantCasinoXp(guildId, userId, bjWon);

        const desc = outcome === "push"
          ? "Both got blackjack — it's a **push**! Bet returned."
          : `**Blackjack!** You won **${payout.toLocaleString()} ${config.currencyName}**!`;

        const e = embed()
          .title(`${config.currencyEmoji} Blackjack`)
          .color(outcome === "push" ? EmbedColors.WARNING : EmbedColors.SUCCESS)
          .description(desc)
          .field("Your Hand", `${formatHand(session.playerHand)} (${handValue(session.playerHand)})`, true)
          .field("Dealer Hand", `${formatHand(finalSession.dealerHand)} (${handValue(finalSession.dealerHand)})`, true)
          .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
          .build();

        return { success: true, embed: e };
      }

      const e = embed()
        .title(`${config.currencyEmoji} Blackjack — Bet: ${bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .field("Your Hand", `${formatHand(session.playerHand)} (${handValue(session.playerHand)})`, true)
        .field("Dealer", formatHand(session.dealerHand, true), true)
        .footer("Choose an action below")
        .build();

      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: "Hit", custom_id: `blackjack:hit:${userId}` },
            { type: 2, style: 2, label: "Stand", custom_id: `blackjack:stand:${userId}` },
            {
              type: 2, style: 3, label: "Double Down",
              custom_id: `blackjack:double:${userId}`,
              disabled: account.balance - bet < bet,
            },
          ],
        },
      ];

      return { success: true, embed: e, components };
    }

    // ── Crash ────────────────────────────────────────────
    if (sub === "crash") {
      const existing = await crash.getSession(guildId, userId);
      if (existing) {
        await accounts.creditBalance(guildId, userId, bet);
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active crash game! Use the buttons to play." };
      }

      const session = await crash.createSession(guildId, userId, bet);
      const nextMult = multiplierAtStep(1);

      const e = embed()
        .title(`${config.currencyEmoji} Crash — Bet: ${bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `:chart_with_upwards_trend: Current: **1.00x**\n` +
          `Next step: **${nextMult}x**\n\n` +
          `Continue to climb higher, or cash out to keep your coins!`,
        )
        .footer("Will it crash? Only one way to find out...")
        .build();

      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: `Continue → ${nextMult}x`, custom_id: `crash:continue:${userId}` },
            { type: 2, style: 3, label: `Cash Out (${bet.toLocaleString()})`, custom_id: `crash:cashout:${userId}` },
          ],
        },
      ];

      return { success: true, embed: e, components };
    }

    // ── Mines ────────────────────────────────────────────
    if (sub === "mines") {
      const mineCount = options?.mines as number;
      if (mineCount < 1 || mineCount > 19) {
        await accounts.creditBalance(guildId, userId, bet);
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "Mine count must be between 1 and 19." };
      }

      const existing = await mines.getSession(guildId, userId);
      if (existing) {
        await accounts.creditBalance(guildId, userId, bet);
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active mines game!" };
      }

      const session = await mines.createSession(guildId, userId, bet, mineCount);

      const e = embed()
        .title(`${config.currencyEmoji} Mines — Bet: ${bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `${formatGrid(session)}\n\n` +
          `:bomb: **${mineCount}** mines hidden in the grid\n` +
          `Pick a cell to reveal it!`,
        )
        .footer("Find gems, avoid mines!")
        .build();

      // Build grid buttons (4 rows of 5)
      const components: any[] = [];
      for (let r = 0; r < 4; r++) {
        const buttons: any[] = [];
        for (let c = 0; c < 5; c++) {
          const idx = r * 5 + c;
          buttons.push({
            type: 2, style: 1, label: `${idx + 1}`,
            custom_id: `mines:cell:${idx}:${userId}`,
          });
        }
        components.push({ type: 1, components: buttons });
      }

      return { success: true, embed: e, components };
    }

    // ── Limbo ────────────────────────────────────────────
    if (sub === "limbo") {
      const target = options?.target as number;
      if (target < 1.1 || target > 100) {
        await accounts.creditBalance(guildId, userId, bet);
        return { success: false, error: "Target must be between 1.1 and 100." };
      }

      const result = playLimbo(bet, target);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const e = embed()
        .title(`${config.currencyEmoji} Limbo`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `Target: **${result.target}x** | Rolled: **${result.rolled}x**\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Plinko ───────────────────────────────────────────
    if (sub === "plinko") {
      const risk = assertChoice(options?.risk, ["low", "medium", "high"], "risk level") as PlinkoRisk;
      const result = playPlinko(bet, risk);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.payout > bet);

      const pathStr = result.path.join("");
      const e = embed()
        .title(`${config.currencyEmoji} Plinko`)
        .color(result.payout > bet ? EmbedColors.SUCCESS : result.payout > 0 ? EmbedColors.WARNING : EmbedColors.ERROR)
        .description(
          `Risk: **${risk}** | Path: \`${pathStr}\`\n` +
          `Landed on slot **${result.slot + 1}** — **${result.multiplier}x**\n\n` +
          (result.payout > bet
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : result.payout > 0
            ? `You got back **${result.payout.toLocaleString()} ${config.currencyName}**.`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Keno ─────────────────────────────────────────────
    if (sub === "keno") {
      const numbersInput = options?.numbers as string;
      const parsed = parseKenoNumbers(numbersInput);
      if (parsed.error) {
        await accounts.creditBalance(guildId, userId, bet);
        return { success: false, error: parsed.error };
      }

      const result = playKeno(bet, parsed.numbers);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const picksStr = result.picks.join(", ");
      const drawnStr = result.drawn.join(", ");
      const hitsStr = result.hits.length > 0 ? result.hits.join(", ") : "None";

      const e = embed()
        .title(`${config.currencyEmoji} Keno`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `**Your picks:** ${picksStr}\n` +
          `**Drawn:** ${drawnStr}\n` +
          `**Hits:** ${hitsStr} (${result.hitCount}/${result.picks.length})\n\n` +
          (result.won
            ? `**${result.multiplier}x** — You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Hi-Lo ────────────────────────────────────────────
    if (sub === "hilo") {
      const existing = await hilo.getSession(guildId, userId);
      if (existing) {
        await accounts.creditBalance(guildId, userId, bet);
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active hi-lo game!" };
      }

      const session = await hilo.createSession(guildId, userId, bet);
      const higherMult = stepMultiplier(session.currentCard.rank, "higher");
      const lowerMult = stepMultiplier(session.currentCard.rank, "lower");

      const e = embed()
        .title(`${config.currencyEmoji} Hi-Lo — Bet: ${bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `Current card: ${hiloCardEmoji(session.currentCard)}\n\n` +
          `Will the next card be **higher** or **lower**?`,
        )
        .footer("Guess correctly to increase your multiplier!")
        .build();

      const buttons: any[] = [];
      if (higherMult > 0) {
        buttons.push({ type: 2, style: 1, label: `Higher (${higherMult}x)`, custom_id: `hilo:higher:${userId}` });
      }
      if (lowerMult > 0) {
        buttons.push({ type: 2, style: 1, label: `Lower (${lowerMult}x)`, custom_id: `hilo:lower:${userId}` });
      }

      const components = [{ type: 1, components: buttons }];
      return { success: true, embed: e, components };
    }

    // ── Video Poker ──────────────────────────────────────
    if (sub === "poker") {
      const existing = await poker.getSession(guildId, userId);
      if (existing) {
        await accounts.creditBalance(guildId, userId, bet);
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active poker game!" };
      }

      const session = await poker.createSession(guildId, userId, bet);

      const e = embed()
        .title(`${config.currencyEmoji} Video Poker — Bet: ${bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `${formatPokerHand(session.hand, session.held)}\n\n` +
          `Toggle cards to **HOLD**, then press **Draw** to replace the rest.\n` +
          `Pay table: Royal Flush 250x | Straight Flush 50x | 4oK 25x | Full House 9x | Flush 6x | Straight 4x | 3oK 3x | Two Pair 2x | J+ Pair 1x`,
        )
        .footer("Click a card to toggle hold, then Draw")
        .build();

      const cardButtons: any[] = [];
      for (let i = 0; i < 5; i++) {
        cardButtons.push({
          type: 2, style: 2,
          label: `${session.hand[i].rank}`,
          custom_id: `poker:toggle:${i}:${userId}`,
        });
      }

      const components = [
        { type: 1, components: cardButtons },
        { type: 1, components: [{ type: 2, style: 1, label: "Draw", custom_id: `poker:draw:0:${userId}` }] },
      ];

      return { success: true, embed: e, components };
    }

    // ── War ──────────────────────────────────────────────
    if (sub === "war") {
      const result = playWar(bet);

      // Debit additional war costs
      const extraCost = result.totalBet - bet;
      if (extraCost > 0) {
        const { success: extraDebited } = await accounts.debitBalance(guildId, userId, extraCost);
        if (!extraDebited) {
          // Can't afford war — forfeit
          const newAccount = await accounts.getOrCreate(guildId, userId);
          const xpMsg = await grantCasinoXp(guildId, userId, false);

          const e = embed()
            .title(`${config.currencyEmoji} War`)
            .color(EmbedColors.ERROR)
            .description(
              `${formatWarCard(result.rounds[0].playerCard)} vs ${formatWarCard(result.rounds[0].dealerCard)} — **TIE!**\n\n` +
              `:crossed_swords: War declared but you couldn't afford the extra bet!\n` +
              `You lost **${bet.toLocaleString()} ${config.currencyName}**.`,
            )
            .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
            .build();

          return { success: true, embed: e };
        }
      }

      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      let desc = result.rounds.map((r, i) => {
        const prefix = i === 0 ? "" : `:crossed_swords: **WAR!** `;
        return `${prefix}${formatWarCard(r.playerCard)} vs ${formatWarCard(r.dealerCard)}`;
      }).join("\n");

      if (result.tied) {
        desc += `\n\n**Push** after ${result.rounds.length} ties! Bet returned.`;
      } else if (result.won) {
        desc += `\n\nYou won **${result.payout.toLocaleString()} ${config.currencyName}**!`;
      } else {
        desc += `\n\nYou lost **${result.totalBet.toLocaleString()} ${config.currencyName}**.`;
      }

      const color = result.tied ? EmbedColors.WARNING : result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR;

      const e = embed()
        .title(`${config.currencyEmoji} War`)
        .color(color)
        .description(desc)
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Horse Race ───────────────────────────────────────
    if (sub === "horserace") {
      const horseNum = options?.horse as number;
      const result = playHorseRace(bet, horseNum);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);
      const xpMsg = await grantCasinoXp(guildId, userId, result.won);

      const finalPositions = result.positions[result.positions.length - 1];
      const chosenHorse = HORSES.find((h) => h.number === horseNum)!;

      const e = embed()
        .title(`${config.currencyEmoji} Horse Race`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `${formatRace(finalPositions)}\n\n` +
          `:trophy: **${result.winner.name}** wins!\n` +
          `You bet on **${chosenHorse.name}** (${chosenHorse.payout}x)\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}${xpMsg}`)
        .build();

      return { success: true, embed: e };
    }

    // ── Duel ─────────────────────────────────────────────
    if (sub === "duel") {
      const targetId = options?.target as string;

      if (targetId === userId) {
        return { success: false, error: "You can't duel yourself!" };
      }

      // Check for existing duel
      const existing = await duels.getSession(guildId, userId);
      if (existing) {
        return { success: false, error: "You already have a pending duel! Wait for it to be accepted or expire." };
      }

      // Debit challenger
      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      await duels.createSession(guildId, userId, targetId, "", bet);

      const e = embed()
        .title(`${config.currencyEmoji} Duel Challenge!`)
        .color(EmbedColors.INFO)
        .description(
          `:crossed_swords: <@${userId}> challenges <@${targetId}> to a duel!\n\n` +
          `Wager: **${bet.toLocaleString()} ${config.currencyName}** each\n` +
          `Winner takes **${Math.floor(bet * 2 * 0.95).toLocaleString()} ${config.currencyName}** (5% house cut)`,
        )
        .footer("The challenged player has 2 minutes to respond")
        .build();

      const components = [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "Accept", custom_id: `duel:accept:${userId}` },
            { type: 2, style: 4, label: "Decline", custom_id: `duel:decline:${userId}` },
          ],
        },
      ];

      return { success: true, embed: e, components };
    }

    // ── Rock Paper Scissors ────────────────────────────
    if (sub === "rps") {
      const targetId = options?.target as string;
      if (targetId === userId) return { success: false, error: "You can't challenge yourself!" };

      const existing = await rps.getSession(guildId, userId);
      if (existing) return { success: false, error: "You already have a pending RPS challenge!" };

      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      const rounds = (options?.rounds as 1 | 3 | 5) ?? 1;
      await rps.createSession(guildId, userId, targetId, "", bet, rounds);

      const e = embed()
        .title(`${config.currencyEmoji} Rock Paper Scissors Challenge!`)
        .color(EmbedColors.INFO)
        .description(
          `:v: <@${userId}> challenges <@${targetId}> to RPS!\n\n` +
          `**Best of ${rounds}** | Wager: **${bet.toLocaleString()} ${config.currencyName}** each\n` +
          `Winner takes **${Math.floor(bet * 2 * 0.95).toLocaleString()} ${config.currencyName}** (5% house cut)`,
        )
        .footer("The challenged player has 2 minutes to respond")
        .build();

      const components = [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Accept", custom_id: `rps:accept:${userId}` },
          { type: 2, style: 4, label: "Decline", custom_id: `rps:decline:${userId}` },
        ],
      }];

      return { success: true, embed: e, components };
    }

    // ── Russian Roulette ────────────────────────────────
    if (sub === "russianroulette") {
      const existing = await russianRoulette.getSession(guildId, userId);
      if (existing) return { success: false, error: "You already have an active Russian Roulette game!" };

      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      const session = await russianRoulette.createSession(guildId, userId, "", bet);

      const e = embed()
        .title(`${config.currencyEmoji} Russian Roulette — Lobby`)
        .color(EmbedColors.INFO)
        .description(
          `:gun: **Buy-in: ${bet.toLocaleString()} ${config.currencyName}**\n\n` +
          `**Players (1/6):**\n1. <@${userId}>\n\n` +
          `Need at least 2 players to start.`,
        )
        .footer("Join the lobby or the host can start the game!")
        .build();

      const components = [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Join", custom_id: `rroulette:join:${userId}` },
          { type: 2, style: 1, label: "Start Game", custom_id: `rroulette:start:${userId}` },
          { type: 2, style: 4, label: "Cancel", custom_id: `rroulette:cancel:${userId}` },
        ],
      }];

      return { success: true, embed: e, components };
    }

    // ── Trivia ──────────────────────────────────────────
    if (sub === "trivia") {
      // Debit host
      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      const session = await trivia.createSession(guildId, userId, bet);

      const LETTER_LABELS = ["A", "B", "C", "D"];
      const choicesList = session.choices.map((c, i) => `**${LETTER_LABELS[i]}.** ${c}`).join("\n");

      const e = embed()
        .title(`${config.currencyEmoji} Trivia — ${session.category}`)
        .color(EmbedColors.INFO)
        .description(
          `${session.question}\n\n${choicesList}\n\n` +
          `Bet: **${bet.toLocaleString()} ${config.currencyName}** | Answer correctly to win **${Math.floor(bet * 1.95).toLocaleString()}**!\n` +
          `*Anyone* can answer — first correct answer wins!`,
        )
        .footer("You have 30 seconds!")
        .build();

      const components = [{
        type: 1,
        components: session.choices.map((_, i) => ({
          type: 2,
          style: 1,
          label: LETTER_LABELS[i],
          custom_id: `trivia:${i}:${userId}`,
        })),
      }];

      return { success: true, embed: e, components };
    }

    // ── Connect Four ────────────────────────────────────
    if (sub === "connect4") {
      const targetId = options?.target as string;
      if (targetId === userId) return { success: false, error: "You can't challenge yourself!" };

      const existing = await connect4.getSession(guildId, userId);
      if (existing) return { success: false, error: "You already have a pending Connect Four game!" };

      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      await connect4.createSession(guildId, userId, targetId, "", bet);

      const e = embed()
        .title(`${config.currencyEmoji} Connect Four Challenge!`)
        .color(EmbedColors.INFO)
        .description(
          `:red_circle: <@${userId}> challenges <@${targetId}> to Connect Four!\n\n` +
          `Wager: **${bet.toLocaleString()} ${config.currencyName}** each\n` +
          `Winner takes **${Math.floor(bet * 2 * 0.95).toLocaleString()} ${config.currencyName}** (5% house cut)`,
        )
        .footer("The challenged player has 5 minutes to respond")
        .build();

      const components = [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Accept", custom_id: `c4:accept:${userId}` },
          { type: 2, style: 4, label: "Decline", custom_id: `c4:decline:${userId}` },
        ],
      }];

      return { success: true, embed: e, components };
    }

    // ── Tic-Tac-Toe ─────────────────────────────────────
    if (sub === "tictactoe") {
      const targetId = options?.target as string;
      if (targetId === userId) return { success: false, error: "You can't challenge yourself!" };

      const existing = await tictactoe.getSession(guildId, userId);
      if (existing) return { success: false, error: "You already have a pending Tic-Tac-Toe game!" };

      const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      await tictactoe.createSession(guildId, userId, targetId, "", bet);

      const e = embed()
        .title(`${config.currencyEmoji} Tic-Tac-Toe Challenge!`)
        .color(EmbedColors.INFO)
        .description(
          `:x: <@${userId}> challenges <@${targetId}> to Tic-Tac-Toe!\n\n` +
          `Wager: **${bet.toLocaleString()} ${config.currencyName}** each\n` +
          `Winner takes **${Math.floor(bet * 2 * 0.95).toLocaleString()} ${config.currencyName}** (5% house cut)`,
        )
        .footer("The challenged player has 3 minutes to respond")
        .build();

      const components = [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "Accept", custom_id: `ttt:accept:${userId}` },
          { type: 2, style: 4, label: "Decline", custom_id: `ttt:decline:${userId}` },
        ],
      }];

      return { success: true, embed: e, components };
    }

    return { success: false, error: "Unknown game. Use a subcommand like coinflip, dice, slots, etc." };
  },
});
