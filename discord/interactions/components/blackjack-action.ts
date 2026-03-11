/**
 * Blackjack Action Component — Handle hit/stand/double-down button presses
 *
 * File: discord/interactions/components/blackjack-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { activityLock } from "../../games/activity-lock.ts";
import {
  blackjack, formatHand, handValue, isBust,
  playDealerHand, determineOutcome, calculatePayout,
} from "../../games/casino/blackjack.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function buildFinishedEmbed(
  session: any,
  outcome: string,
  payout: number,
  balance: number,
  config: any,
) {
  const outcomeMessages: Record<string, string> = {
    "player-blackjack": `**Blackjack!** You won **${payout.toLocaleString()} ${config.currencyName}**!`,
    "player-win": `You win! **+${payout.toLocaleString()} ${config.currencyName}**`,
    "dealer-bust": `Dealer busts! You win **+${payout.toLocaleString()} ${config.currencyName}**`,
    "dealer-win": `Dealer wins. You lost **${session.bet.toLocaleString()} ${config.currencyName}**.`,
    "player-bust": `Bust! You lost **${session.bet.toLocaleString()} ${config.currencyName}**.`,
    "push": "**Push!** Your bet has been returned.",
  };

  const isWin = ["player-blackjack", "player-win", "dealer-bust"].includes(outcome);
  const color = outcome === "push" ? EmbedColors.WARNING : isWin ? EmbedColors.SUCCESS : EmbedColors.ERROR;

  return embed()
    .title(`${config.currencyEmoji} Blackjack — Result`)
    .color(color)
    .description(outcomeMessages[outcome] ?? "Game over.")
    .field("Your Hand", `${formatHand(session.playerHand)} (${handValue(session.playerHand)})`, true)
    .field("Dealer Hand", `${formatHand(session.dealerHand)} (${handValue(session.dealerHand)})`, true)
    .footer(`Balance: ${balance.toLocaleString()} ${config.currencyName}`)
    .build();
}

export default defineComponent({
  customId: "blackjack:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // hit, stand, double
    const targetUserId = parts[2];

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your game!" };
    }

    const session = await blackjack.getSession(guildId, userId);
    if (!session || session.status === "done") {
      return { success: false, error: "No active blackjack game. Start one with `/casino blackjack`." };
    }

    const config = await gamesConfig.get(guildId);

    if (action === "hit") {
      session.playerHand.push(session.deck.pop()!);

      if (isBust(session.playerHand)) {
        session.status = "done";
        await blackjack.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);
        return {
          success: true,
          updateMessage: true,
          embed: buildFinishedEmbed(session, "player-bust", 0, newAccount.balance, config),
          components: [],
        };
      }

      // Still playing
      await blackjack.updateSession(session);
      const e = embed()
        .title(`${config.currencyEmoji} Blackjack — Bet: ${session.bet.toLocaleString()}`)
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
          ],
        },
      ];

      return { success: true, updateMessage: true, embed: e, components };
    }

    if (action === "stand") {
      const finalSession = playDealerHand(session);
      const outcome = determineOutcome(finalSession);
      const payout = calculatePayout(session.bet, outcome);
      if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
      await blackjack.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      return {
        success: true,
        updateMessage: true,
        embed: buildFinishedEmbed(finalSession, outcome, payout, newAccount.balance, config),
        components: [],
      };
    }

    if (action === "double") {
      // Re-fetch session atomically to prevent concurrent double-down
      const freshSession = await blackjack.getSession(guildId, userId);
      if (!freshSession || freshSession.status === "done" || freshSession.deck.length !== session.deck.length) {
        return { success: false, error: "This action has already been processed." };
      }

      // Double the bet — debit additional coins
      const { success: debited } = await accounts.debitBalance(guildId, userId, freshSession.bet);
      if (!debited) {
        return { success: false, error: "Insufficient funds to double down." };
      }
      freshSession.bet *= 2;

      // Draw exactly one card, then stand
      freshSession.playerHand.push(freshSession.deck.pop()!);

      if (isBust(freshSession.playerHand)) {
        freshSession.status = "done";
        await blackjack.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);
        return {
          success: true,
          updateMessage: true,
          embed: buildFinishedEmbed(freshSession, "player-bust", 0, newAccount.balance, config),
          components: [],
        };
      }

      const finalSession = playDealerHand(freshSession);
      const outcome = determineOutcome(finalSession);
      const payout = calculatePayout(freshSession.bet, outcome);
      if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
      await blackjack.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      return {
        success: true,
        updateMessage: true,
        embed: buildFinishedEmbed(finalSession, outcome, payout, newAccount.balance, config),
        components: [],
      };
    }

    return { success: false, error: "Unknown action." };
  },
});
