/**
 * Hi-Lo Action Component — Handle higher/lower/cash-out button presses
 *
 * File: discord/interactions/components/hilo-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { activityLock } from "../../games/activity-lock.ts";
import { hilo, processGuess, cardEmoji, stepMultiplier } from "../../games/casino/hilo.ts";
import type { HiLoGuess } from "../../games/casino/hilo.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function buildHiLoButtons(userId: string, currentRank: string): any[] {
  const higherMult = stepMultiplier(currentRank, "higher");
  const lowerMult = stepMultiplier(currentRank, "lower");

  const buttons: any[] = [];
  if (higherMult > 0) {
    buttons.push({ type: 2, style: 1, label: `Higher (${higherMult}x)`, custom_id: `hilo:higher:${userId}` });
  }
  if (lowerMult > 0) {
    buttons.push({ type: 2, style: 1, label: `Lower (${lowerMult}x)`, custom_id: `hilo:lower:${userId}` });
  }
  buttons.push({ type: 2, style: 3, label: "Cash Out", custom_id: `hilo:cashout:${userId}` });

  return [{ type: 1, components: buttons }];
}

export default defineComponent({
  customId: "hilo:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1] as HiLoGuess | "cashout";
    const targetUserId = parts[2];

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your game!" };
    }

    const session = await hilo.getSession(guildId, userId);
    if (!session || session.status === "done") {
      return { success: false, error: "No active hi-lo game." };
    }

    const config = await gamesConfig.get(guildId);

    if (action === "cashout") {
      const payout = Math.floor(session.bet * session.currentMultiplier);
      if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
      await hilo.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      const e = embed()
        .title(`${config.currencyEmoji} Hi-Lo — Cashed Out!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `Final card: ${cardEmoji(session.currentCard)}\n` +
          `Streak: **${session.streak}** | Multiplier: **${session.currentMultiplier}x**\n\n` +
          `You won **${payout.toLocaleString()} ${config.currencyName}**!`,
        )
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    if (action === "higher" || action === "lower") {
      const previousCard = session.currentCard;
      const result = processGuess(session, action);

      if (!result.correct) {
        session.status = "done";
        await hilo.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);
        const newAccount = await accounts.getOrCreate(guildId, userId);

        const e = embed()
          .title(`${config.currencyEmoji} Hi-Lo — Wrong!`)
          .color(EmbedColors.ERROR)
          .description(
            `${cardEmoji(previousCard)} → ${cardEmoji(result.nextCard)}\n\n` +
            `You guessed **${action}** but it was **${result.nextCard.rank}**!\n` +
            `You lost **${session.bet.toLocaleString()} ${config.currencyName}**.`,
          )
          .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      // Correct guess
      await hilo.updateSession(session);
      const payout = Math.floor(session.bet * session.currentMultiplier);

      const e = embed()
        .title(`${config.currencyEmoji} Hi-Lo — Bet: ${session.bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `${cardEmoji(previousCard)} → ${cardEmoji(result.nextCard)} ✓\n\n` +
          `Streak: **${session.streak}** | Multiplier: **${session.currentMultiplier}x**\n` +
          `Current card: ${cardEmoji(session.currentCard)}\n` +
          `Potential payout: **${payout.toLocaleString()} ${config.currencyName}**`,
        )
        .footer("Guess the next card or cash out!")
        .build();

      return {
        success: true,
        updateMessage: true,
        embed: e,
        components: buildHiLoButtons(userId, session.currentCard.rank),
      };
    }

    return { success: false, error: "Unknown action." };
  },
});
