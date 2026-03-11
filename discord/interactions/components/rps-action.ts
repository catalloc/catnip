/**
 * RPS Action Component — Handle accept/decline and rock/paper/scissors picks
 *
 * File: discord/interactions/components/rps-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { rps, resolveRps, choiceEmoji } from "../../games/casino/rps.ts";
import type { RpsChoice } from "../../games/casino/rps.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function pickButtons(challengerId: string): any[] {
  return [{
    type: 1,
    components: [
      { type: 2, style: 1, label: "Rock", emoji: { name: "🪨" }, custom_id: `rps:pick:rock:${challengerId}` },
      { type: 2, style: 1, label: "Paper", emoji: { name: "📄" }, custom_id: `rps:pick:paper:${challengerId}` },
      { type: 2, style: 1, label: "Scissors", emoji: { name: "✂️" }, custom_id: `rps:pick:scissors:${challengerId}` },
    ],
  }];
}

export default defineComponent({
  customId: "rps:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // accept, decline, pick
    const challengerId = action === "pick" ? parts[3] : parts[2];

    const session = await rps.getSession(guildId, challengerId);
    if (!session) {
      return { success: false, error: "This RPS game has expired or already ended." };
    }

    const config = await gamesConfig.get(guildId);

    // ── Decline ──
    if (action === "decline") {
      if (userId !== session.targetId) {
        return { success: false, error: "This challenge isn't for you!" };
      }
      await accounts.creditBalance(guildId, session.challengerId, session.bet);
      await rps.deleteSession(guildId, challengerId);

      const e = embed()
        .title(`${config.currencyEmoji} RPS — Declined`)
        .color(EmbedColors.WARNING)
        .description(`<@${userId}> declined the RPS challenge. <@${challengerId}>'s bet has been refunded.`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    // ── Accept ──
    if (action === "accept") {
      if (userId !== session.targetId) {
        return { success: false, error: "This challenge isn't for you!" };
      }

      const targetAccount = await accounts.getOrCreate(guildId, userId);
      if (targetAccount.balance < session.bet) {
        return { success: false, error: `You need **${session.bet.toLocaleString()}** coins to accept!` };
      }

      const { success: debited } = await accounts.debitBalance(guildId, userId, session.bet);
      if (!debited) return { success: false, error: "Insufficient funds." };

      session.status = "picking";
      await rps.updateSession(session);

      const e = embed()
        .title(`${config.currencyEmoji} Rock Paper Scissors — Round ${session.currentRound}/${session.rounds}`)
        .color(EmbedColors.INFO)
        .description(
          `<@${session.challengerId}> vs <@${session.targetId}>\n` +
          `Wager: **${session.bet.toLocaleString()} ${config.currencyName}** each\n\n` +
          `Both players: pick your move!`,
        )
        .footer("Your pick is secret until both players choose")
        .build();

      return { success: true, updateMessage: true, embed: e, components: pickButtons(challengerId) };
    }

    // ── Pick ──
    if (action === "pick") {
      const choice = parts[2] as RpsChoice;
      if (!["rock", "paper", "scissors"].includes(choice)) {
        return { success: false, error: "Invalid choice." };
      }

      if (session.status !== "picking") {
        return { success: false, error: "The game isn't in the picking phase!" };
      }

      const isChallenger = userId === session.challengerId;
      const isTarget = userId === session.targetId;
      if (!isChallenger && !isTarget) {
        return { success: false, error: "You're not in this game!" };
      }

      // Record choice
      if (isChallenger) {
        if (session.challengerChoice !== null) return { success: false, error: "You already picked!" };
        session.challengerChoice = choice;
      } else {
        if (session.targetChoice !== null) return { success: false, error: "You already picked!" };
        session.targetChoice = choice;
      }

      // If only one player has picked, update and wait
      if (session.challengerChoice === null || session.targetChoice === null) {
        await rps.updateSession(session);

        const waitingFor = session.challengerChoice === null ? session.challengerId : session.targetId;
        const e = embed()
          .title(`${config.currencyEmoji} Rock Paper Scissors — Round ${session.currentRound}/${session.rounds}`)
          .color(EmbedColors.INFO)
          .description(
            `<@${session.challengerId}> vs <@${session.targetId}>\n\n` +
            `<@${userId}> has picked! Waiting for <@${waitingFor}>...`,
          )
          .footer("Your pick is secret until both players choose")
          .build();

        return { success: true, updateMessage: true, embed: e, components: pickButtons(challengerId) };
      }

      // Both picked — resolve this round
      const result = resolveRps(session);

      if (result.draw) {
        // Re-do the round
        session.challengerChoice = null;
        session.targetChoice = null;
        await rps.updateSession(session);

        const e = embed()
          .title(`${config.currencyEmoji} Rock Paper Scissors — Round ${session.currentRound}/${session.rounds}`)
          .color(EmbedColors.WARNING)
          .description(
            `${choiceEmoji(result.challengerChoice)} vs ${choiceEmoji(result.targetChoice)} — **Draw!** Go again!\n\n` +
            `Score: <@${session.challengerId}> **${session.challengerWins}** - **${session.targetWins}** <@${session.targetId}>`,
          )
          .footer("Pick again!")
          .build();

        return { success: true, updateMessage: true, embed: e, components: pickButtons(challengerId) };
      }

      // Update score
      if (result.winnerId === session.challengerId) session.challengerWins++;
      else session.targetWins++;

      const winsNeeded = Math.ceil(session.rounds / 2);
      const gameOver = session.challengerWins >= winsNeeded || session.targetWins >= winsNeeded;

      if (!gameOver) {
        // Next round
        session.currentRound++;
        session.challengerChoice = null;
        session.targetChoice = null;
        await rps.updateSession(session);

        const e = embed()
          .title(`${config.currencyEmoji} Rock Paper Scissors — Round ${session.currentRound}/${session.rounds}`)
          .color(EmbedColors.INFO)
          .description(
            `Round ${session.currentRound - 1}: ${choiceEmoji(result.challengerChoice)} vs ${choiceEmoji(result.targetChoice)} — <@${result.winnerId}> wins!\n\n` +
            `Score: <@${session.challengerId}> **${session.challengerWins}** - **${session.targetWins}** <@${session.targetId}>\n\n` +
            `Pick your move for round ${session.currentRound}!`,
          )
          .footer("Your pick is secret until both players choose")
          .build();

        return { success: true, updateMessage: true, embed: e, components: pickButtons(challengerId) };
      }

      // Game over
      const finalWinnerId = session.challengerWins > session.targetWins
        ? session.challengerId : session.targetId;
      const finalLoserId = finalWinnerId === session.challengerId
        ? session.targetId : session.challengerId;
      const winnerPayout = Math.floor(session.bet * 2 * 0.95);

      await accounts.creditBalance(guildId, finalWinnerId, winnerPayout);
      await rps.deleteSession(guildId, challengerId);

      await xp.grantXp(guildId, finalWinnerId, XP_AWARDS.CASINO_WIN);
      await xp.grantXp(guildId, finalLoserId, XP_AWARDS.CASINO_LOSS);

      const winnerAccount = await accounts.getOrCreate(guildId, finalWinnerId);
      const loserAccount = await accounts.getOrCreate(guildId, finalLoserId);

      const e = embed()
        .title(`${config.currencyEmoji} Rock Paper Scissors — Result!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `${choiceEmoji(result.challengerChoice)} vs ${choiceEmoji(result.targetChoice)}\n\n` +
          `Final Score: <@${session.challengerId}> **${session.challengerWins}** - **${session.targetWins}** <@${session.targetId}>\n\n` +
          `:trophy: <@${finalWinnerId}> wins **${winnerPayout.toLocaleString()} ${config.currencyName}**!`,
        )
        .field("Winner Balance", `${winnerAccount.balance.toLocaleString()} ${config.currencyName}`, true)
        .field("Loser Balance", `${loserAccount.balance.toLocaleString()} ${config.currencyName}`, true)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    return { success: false, error: "Unknown action." };
  },
});
