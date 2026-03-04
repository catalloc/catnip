/**
 * Casino Command — Play casino games: slots, coinflip, dice, roulette, blackjack
 *
 * File: discord/interactions/commands/casino.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { playCoinflip } from "../../economy/casino/coinflip.ts";
import { playDice } from "../../economy/casino/dice.ts";
import { playSlots } from "../../economy/casino/slots.ts";
import { playRoulette } from "../../economy/casino/roulette.ts";
import {
  blackjack, formatHand, handValue, isBlackjack, isBust,
  playDealerHand, determineOutcome, calculatePayout,
} from "../../economy/casino/blackjack.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function validateBet(bet: number, balance: number, min: number, max: number): string | null {
  if (bet < min) return `Minimum bet is **${min.toLocaleString()}**.`;
  if (bet > max) return `Maximum bet is **${max.toLocaleString()}**.`;
  if (bet > balance) return `You only have **${balance.toLocaleString()}** coins.`;
  return null;
}

export default defineCommand({
  name: "casino",
  description: "Play casino games to win or lose coins",

  options: [
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
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (!config.casinoEnabled) {
      return { success: false, error: "The casino is closed in this server." };
    }

    const bet = options?.bet as number;
    const account = await accounts.getOrCreate(guildId, userId);
    const betError = validateBet(bet, account.balance, config.casinoMinBet, config.casinoMaxBet);
    if (betError) return { success: false, error: betError };

    // Debit first
    const { success: debited } = await accounts.debitBalance(guildId, userId, bet);
    if (!debited) return { success: false, error: "Insufficient funds." };

    if (sub === "coinflip") {
      const call = options?.call as "heads" | "tails";
      const result = playCoinflip(bet, call);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      const e = embed()
        .title(`${config.currencyEmoji} Coin Flip`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `You called **${result.choice}** — it landed on **${result.result}**!\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "dice") {
      const number = options?.number as number;
      const result = playDice(bet, number);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      const e = embed()
        .title(`${config.currencyEmoji} Dice Roll`)
        .color(result.won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(
          `You picked **${result.choice}** — the die rolled **${result.rolled}**!\n\n` +
          (result.won
            ? `You won **${result.payout.toLocaleString()} ${config.currencyName}**!`
            : `You lost **${bet.toLocaleString()} ${config.currencyName}**.`),
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "slots") {
      const result = playSlots(bet);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);

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
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "roulette") {
      const betType = options?.type as "red" | "black" | "number";
      const number = (options?.number as number) ?? 0;
      if (betType === "number" && (number < 0 || number > 36)) {
        await accounts.creditBalance(guildId, userId, bet); // refund
        return { success: false, error: "Number must be between 0 and 36." };
      }
      const result = playRoulette(bet, betType, number);
      if (result.payout > 0) await accounts.creditBalance(guildId, userId, result.payout);
      const newAccount = await accounts.getOrCreate(guildId, userId);

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
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "blackjack") {
      // Check for existing session
      const existing = await blackjack.getSession(guildId, userId);
      if (existing) {
        await accounts.creditBalance(guildId, userId, bet); // refund
        return { success: false, error: "You already have an active blackjack game! Use the buttons to play." };
      }

      const session = await blackjack.createSession(guildId, userId, "", "", bet);

      // Check for natural blackjack
      if (isBlackjack(session.playerHand)) {
        const finalSession = playDealerHand(session);
        const outcome = determineOutcome(finalSession);
        const payout = calculatePayout(bet, outcome);
        if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
        await blackjack.deleteSession(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);

        const desc = outcome === "push"
          ? "Both got blackjack — it's a **push**! Bet returned."
          : `**Blackjack!** You won **${payout.toLocaleString()} ${config.currencyName}**!`;

        const e = embed()
          .title(`${config.currencyEmoji} Blackjack`)
          .color(outcome === "push" ? EmbedColors.WARNING : EmbedColors.SUCCESS)
          .description(desc)
          .field("Your Hand", `${formatHand(session.playerHand)} (${handValue(session.playerHand)})`, true)
          .field("Dealer Hand", `${formatHand(finalSession.dealerHand)} (${handValue(finalSession.dealerHand)})`, true)
          .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
          .build();

        return { success: true, embed: e };
      }

      // Active game — show hand with buttons
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
              disabled: account.balance - bet < bet, // can't double if not enough coins
            },
          ],
        },
      ];

      return { success: true, embed: e, components };
    }

    return { success: false, error: "Please use a subcommand: coinflip, dice, slots, roulette, or blackjack." };
  },
});
