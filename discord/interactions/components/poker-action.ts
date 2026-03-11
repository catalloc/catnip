/**
 * Poker Action Component — Handle hold/draw button presses
 *
 * File: discord/interactions/components/poker-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { activityLock } from "../../games/activity-lock.ts";
import {
  poker, cardEmoji, formatPokerHand, drawReplacements,
  evaluateHand, getHandLabel, getHandPayout,
} from "../../games/casino/poker.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function buildPokerButtons(session: any, userId: string): any[] {
  const cardButtons: any[] = [];
  for (let i = 0; i < 5; i++) {
    cardButtons.push({
      type: 2,
      style: session.held[i] ? 3 : 2,
      label: `${session.held[i] ? "HOLD" : ""} ${session.hand[i].rank}`,
      custom_id: `poker:toggle:${i}:${userId}`,
    });
  }

  return [
    { type: 1, components: cardButtons },
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Draw", custom_id: `poker:draw:0:${userId}` },
      ],
    },
  ];
}

export default defineComponent({
  customId: "poker:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // toggle, draw
    const param = parseInt(parts[2], 10);
    const targetUserId = parts[3];

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your game!" };
    }

    const session = await poker.getSession(guildId, userId);
    if (!session || session.status === "done") {
      return { success: false, error: "No active poker game." };
    }

    const config = await gamesConfig.get(guildId);

    if (action === "toggle" && session.phase === "hold") {
      if (param < 0 || param > 4) return { success: false, error: "Invalid card." };

      session.held[param] = !session.held[param];
      await poker.updateSession(session);

      const e = embed()
        .title(`${config.currencyEmoji} Video Poker — Bet: ${session.bet.toLocaleString()}`)
        .color(EmbedColors.INFO)
        .description(
          `${formatPokerHand(session.hand, session.held)}\n\n` +
          `Toggle cards to **HOLD**, then press **Draw** to replace the rest.`,
        )
        .footer("Click a card to toggle hold, then Draw")
        .build();

      return { success: true, updateMessage: true, embed: e, components: buildPokerButtons(session, userId) };
    }

    if (action === "draw" && session.phase === "hold") {
      drawReplacements(session);
      const handRank = evaluateHand(session.hand);
      const multiplier = getHandPayout(handRank);
      const payout = Math.floor(session.bet * multiplier);

      if (payout > 0) await accounts.creditBalance(guildId, userId, payout);
      await poker.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);
      const newAccount = await accounts.getOrCreate(guildId, userId);

      const won = payout > 0;
      const handDisplay = session.hand.map(cardEmoji).join(" ");
      const desc = won
        ? `${handDisplay}\n\n**${getHandLabel(handRank)}!** (${multiplier}x)\nYou won **${payout.toLocaleString()} ${config.currencyName}**!`
        : `${handDisplay}\n\n**${getHandLabel(handRank)}**\nYou lost **${session.bet.toLocaleString()} ${config.currencyName}**.`;

      const e = embed()
        .title(`${config.currencyEmoji} Video Poker — Result`)
        .color(won ? EmbedColors.SUCCESS : EmbedColors.ERROR)
        .description(desc)
        .footer(`Balance: ${newAccount.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    return { success: false, error: "Unknown action." };
  },
});
