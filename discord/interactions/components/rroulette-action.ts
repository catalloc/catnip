/**
 * Russian Roulette Action Component — Handle join, start, and pull actions
 *
 * File: discord/interactions/components/rroulette-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { russianRoulette, pullTrigger, calculateSurvivorPayout } from "../../games/casino/russian-roulette.ts";
import { xp, XP_AWARDS } from "../../games/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function lobbyEmbed(config: any, session: any): any {
  const playerList = session.players.map((p: string, i: number) =>
    `${i + 1}. <@${p}>`
  ).join("\n");

  return embed()
    .title(`${config.currencyEmoji} Russian Roulette — Lobby`)
    .color(EmbedColors.INFO)
    .description(
      `:gun: **Buy-in: ${session.bet.toLocaleString()} ${config.currencyName}**\n\n` +
      `**Players (${session.players.length}/6):**\n${playerList}\n\n` +
      `Need at least 2 players to start.`,
    )
    .footer("Join the lobby or the host can start the game!")
    .build();
}

function lobbyButtons(hostId: string): any[] {
  return [{
    type: 1,
    components: [
      { type: 2, style: 3, label: "Join", custom_id: `rroulette:join:${hostId}` },
      { type: 2, style: 1, label: "Start Game", custom_id: `rroulette:start:${hostId}` },
      { type: 2, style: 4, label: "Cancel", custom_id: `rroulette:cancel:${hostId}` },
    ],
  }];
}

function gameEmbed(config: any, session: any): any {
  const currentPlayerId = session.alivePlayers[session.currentTurn % session.alivePlayers.length];
  const playerList = session.alivePlayers.map((p: string) =>
    p === currentPlayerId ? `> :point_right: <@${p}>` : `<@${p}>`
  ).join("\n");

  return embed()
    .title(`${config.currencyEmoji} Russian Roulette`)
    .color(EmbedColors.WARNING)
    .description(
      `:gun: **${session.alivePlayers.length} players remain**\n\n` +
      `${playerList}\n\n` +
      `<@${currentPlayerId}>, it's your turn. Pull the trigger!`,
    )
    .footer(`Pot: ${(session.bet * session.players.length).toLocaleString()} ${config.currencyName}`)
    .build();
}

function pullButton(hostId: string): any[] {
  return [{
    type: 1,
    components: [
      { type: 2, style: 4, label: "Pull the Trigger", emoji: { name: "💀" }, custom_id: `rroulette:pull:${hostId}` },
    ],
  }];
}

export default defineComponent({
  customId: "rroulette:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1];
    const hostId = parts[2];

    const session = await russianRoulette.getSession(guildId, hostId);
    if (!session) {
      return { success: false, error: "This Russian Roulette game has expired or ended." };
    }

    const config = await gamesConfig.get(guildId);

    // ── Cancel ──
    if (action === "cancel") {
      if (userId !== session.hostId) {
        return { success: false, error: "Only the host can cancel!" };
      }
      if (session.status !== "lobby") {
        return { success: false, error: "Can't cancel a game in progress!" };
      }
      // Refund all players
      for (const playerId of session.players) {
        await accounts.creditBalance(guildId, playerId, session.bet);
      }
      await russianRoulette.deleteSession(guildId, hostId);

      const e = embed()
        .title(`${config.currencyEmoji} Russian Roulette — Cancelled`)
        .color(EmbedColors.WARNING)
        .description("The game was cancelled. All bets refunded.")
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    // ── Join ──
    if (action === "join") {
      if (session.status !== "lobby") {
        return { success: false, error: "The game has already started!" };
      }
      if (session.players.includes(userId)) {
        return { success: false, error: "You're already in the lobby!" };
      }
      if (session.players.length >= 6) {
        return { success: false, error: "The lobby is full (6 players max)!" };
      }

      // Debit joiner
      const { success: debited } = await accounts.debitBalance(guildId, userId, session.bet);
      if (!debited) {
        return { success: false, error: `You need **${session.bet.toLocaleString()}** coins to join!` };
      }

      session.players.push(userId);
      await russianRoulette.updateSession(session);

      return {
        success: true,
        updateMessage: true,
        embed: lobbyEmbed(config, session),
        components: lobbyButtons(hostId),
      };
    }

    // ── Start ──
    if (action === "start") {
      if (userId !== session.hostId) {
        return { success: false, error: "Only the host can start the game!" };
      }
      if (session.status !== "lobby") {
        return { success: false, error: "The game has already started!" };
      }

      const started = russianRoulette.startGame(session);
      if (!started) {
        return { success: false, error: "Need at least 2 players to start!" };
      }

      await russianRoulette.updateSession(session);

      return {
        success: true,
        updateMessage: true,
        embed: gameEmbed(config, session),
        components: pullButton(hostId),
      };
    }

    // ── Pull ──
    if (action === "pull") {
      if (session.status !== "playing") {
        return { success: false, error: "The game hasn't started yet!" };
      }

      const currentPlayerId = session.alivePlayers[session.currentTurn % session.alivePlayers.length];
      if (userId !== currentPlayerId) {
        return { success: false, error: "It's not your turn!" };
      }

      const result = pullTrigger(session);

      if (!result.fired) {
        // Safe — advance turn
        session.currentTurn++;
        await russianRoulette.updateSession(session);

        const e = embed()
          .title(`${config.currencyEmoji} Russian Roulette`)
          .color(EmbedColors.INFO)
          .description(
            `:gun: *click* — <@${userId}> survives!\n\n` +
            gameEmbed(config, session).description,
          )
          .footer(`Pot: ${(session.bet * session.players.length).toLocaleString()} ${config.currencyName}`)
          .build();

        return {
          success: true,
          updateMessage: true,
          embed: gameEmbed(config, session),
          components: pullButton(hostId),
        };
      }

      // BANG — player eliminated
      session.alivePlayers = session.alivePlayers.filter((p: string) => p !== result.eliminatedId);
      session.status = "done";

      const totalPot = session.bet * session.players.length;
      const survivors = session.alivePlayers;
      const payout = calculateSurvivorPayout(totalPot, survivors.length);

      // Pay survivors
      for (const survivorId of survivors) {
        await accounts.creditBalance(guildId, survivorId, payout);
        await xp.grantXp(guildId, survivorId, XP_AWARDS.CASINO_WIN);
      }
      await xp.grantXp(guildId, result.eliminatedId!, XP_AWARDS.CASINO_LOSS);

      await russianRoulette.deleteSession(guildId, hostId);

      const survivorList = survivors.map((p: string) => `<@${p}>`).join(", ");

      const e = embed()
        .title(`${config.currencyEmoji} Russian Roulette — BANG!`)
        .color(EmbedColors.ERROR)
        .description(
          `:boom: <@${result.eliminatedId}> pulled the trigger and... **BANG!**\n\n` +
          `:trophy: Survivors: ${survivorList}\n` +
          `Each survivor wins **${payout.toLocaleString()} ${config.currencyName}**!`,
        )
        .footer(`Pot was ${totalPot.toLocaleString()} ${config.currencyName} (5% house cut)`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    return { success: false, error: "Unknown action." };
  },
});
