/**
 * Trivia Action Component — Handle answer button presses
 *
 * File: discord/interactions/components/trivia-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { trivia } from "../../games/casino/trivia.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

const LETTER_LABELS = ["A", "B", "C", "D"];

export default defineComponent({
  customId: "trivia:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const answerIndex = parseInt(parts[1], 10);
    const hostId = parts[2];

    const session = await trivia.getSession(guildId, hostId);
    if (!session) {
      return { success: false, error: "This trivia question has expired!" };
    }

    if (session.status === "done") {
      return { success: false, error: "This question has already been answered!" };
    }

    const config = await gamesConfig.get(guildId);
    const correct = answerIndex === session.correctIndex;

    session.answeredBy = userId;
    session.status = "done";
    await trivia.updateSession(session);

    const choicesList = session.choices.map((c, i) => {
      const prefix = i === session.correctIndex ? ":white_check_mark:" : (i === answerIndex ? ":x:" : ":black_medium_small_square:");
      return `${prefix} **${LETTER_LABELS[i]}.** ${c}`;
    }).join("\n");

    if (correct) {
      // Winner gets 2x their bet (minus house cut)
      const payout = Math.floor(session.bet * 1.95);
      await accounts.creditBalance(guildId, userId, payout);
      await xp.grantXp(guildId, userId, XP_AWARDS.CASINO_WIN);
      const account = await accounts.getOrCreate(guildId, userId);

      const e = embed()
        .title(`${config.currencyEmoji} Trivia — Correct!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `**${session.category}:** ${session.question}\n\n${choicesList}\n\n` +
          `:brain: <@${userId}> answered correctly and wins **${payout.toLocaleString()} ${config.currencyName}**!`,
        )
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    // Wrong answer — host loses bet, no one wins
    await xp.grantXp(guildId, userId, XP_AWARDS.CASINO_LOSS);

    // If answered by someone other than host, give them a small XP consolation
    if (userId !== session.hostId) {
      await xp.grantXp(guildId, session.hostId, XP_AWARDS.CASINO_LOSS);
    }

    await trivia.deleteSession(guildId, hostId);

    const e = embed()
      .title(`${config.currencyEmoji} Trivia — Wrong!`)
      .color(EmbedColors.ERROR)
      .description(
        `**${session.category}:** ${session.question}\n\n${choicesList}\n\n` +
        `<@${userId}> answered **${LETTER_LABELS[answerIndex]}** — wrong!\n` +
        `<@${session.hostId}> lost **${session.bet.toLocaleString()} ${config.currencyName}**.`,
      )
      .build();

    return { success: true, updateMessage: true, embed: e, components: [] };
  },
});
