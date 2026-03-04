/**
 * discord/economy/idle-command-helper.ts
 *
 * Shared executor builder for farm/mine/forage commands.
 * Each command is a thin wrapper around buildIdleExecutor().
 */

import { accounts } from "./accounts.ts";
import { economyConfig } from "./economy-config.ts";
import { xp, makeXpBar, XP_AWARDS } from "./xp.ts";
import { idleActions, rollIdleOutcome } from "./idle-actions.ts";
import { embed } from "../helpers/embed-builder.ts";
import { EmbedColors } from "../constants.ts";
import type { IdleActionType, IdleActionTier, EconomyGuildConfig } from "./types.ts";
import type { CommandResult, CommandContext } from "../interactions/define-command.ts";

type ConfigKey = "farmEnabled" | "mineEnabled" | "forageEnabled";

const ACTION_VERBS: Record<IdleActionType, { start: string; collect: string; item: string }> = {
  farm: { start: "planted", collect: "harvested", item: "crop" },
  mine: { start: "started mining", collect: "mined", item: "ore" },
  forage: { start: "went foraging for", collect: "foraged", item: "item" },
};

function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

export function buildIdleExecutor(
  actionType: IdleActionType,
  tiers: IdleActionTier[],
  configKey: ConfigKey,
) {
  const verbs = ACTION_VERBS[actionType];

  return async function execute(ctx: CommandContext): Promise<CommandResult> {
    const { guildId, userId, options } = ctx;
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (!config[configKey]) {
      return { success: false, error: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} is disabled in this server.` };
    }

    if (sub === "start") {
      const tierId = options?.type as string;
      const tier = idleActions.getTier(tiers, tierId);
      if (!tier) return { success: false, error: `Unknown ${verbs.item} type.` };

      const playerLevel = await xp.getLevel(guildId, userId);
      if (playerLevel < tier.requiredLevel) {
        return { success: false, error: `You need to be **Level ${tier.requiredLevel}** to ${actionType} **${tier.name}**. You're Level ${playerLevel}.` };
      }

      const result = await idleActions.startAction(actionType, guildId, userId, tier);
      if (!result.success) return { success: false, error: result.error };

      const e = embed()
        .title(`${config.currencyEmoji} ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`)
        .color(EmbedColors.INFO)
        .description(
          `You ${verbs.start} **${tier.name}**! Come back in **${formatDuration(tier.cooldownMs)}** to collect.`,
        )
        .footer(`Use /${actionType} harvest to collect when ready`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "harvest") {
      const collectResult = await idleActions.collectAction(actionType, guildId, userId);
      if (!collectResult.success) return { success: false, error: collectResult.error };

      const state = collectResult.state!;
      const tier = idleActions.getTier(tiers, state.tierId);
      if (!tier) return { success: false, error: "Invalid tier data." };

      const outcome = rollIdleOutcome(tier);

      // Credit coins
      const account = await accounts.creditBalance(guildId, userId, outcome.reward);

      // Grant XP
      const xpResult = await xp.grantXp(guildId, userId, outcome.xp);

      let desc = `You ${verbs.collect} **${tier.name}** and earned **${outcome.reward.toLocaleString()} ${config.currencyName}**!`;
      if (outcome.isRare) {
        desc = `:sparkles: **RARE FIND!** ${desc}`;
      }
      desc += `\n+${outcome.xp} XP`;
      if (xpResult.levelsGained > 0) {
        desc += ` | :arrow_up: **Level up! You're now Level ${xpResult.newLevel}!**`;
      }

      const color = outcome.isRare ? EmbedColors.WARNING : EmbedColors.SUCCESS;
      const e = embed()
        .title(`${config.currencyEmoji} ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`)
        .color(color)
        .description(desc)
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName} • ${makeXpBar(xpResult.state.xp)}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "status") {
      const state = await idleActions.getState(actionType, guildId, userId);
      if (!state || state.collected) {
        return { success: true, message: `No active ${actionType} session. Use \`/${actionType} start\` to begin!` };
      }

      const tier = idleActions.getTier(tiers, state.tierId);
      const now = Date.now();
      const ready = now >= state.readyAt;
      const remaining = ready ? 0 : state.readyAt - now;

      const e = embed()
        .title(`${config.currencyEmoji} ${actionType.charAt(0).toUpperCase() + actionType.slice(1)} Status`)
        .color(ready ? EmbedColors.SUCCESS : EmbedColors.INFO)
        .field(verbs.item.charAt(0).toUpperCase() + verbs.item.slice(1), tier?.name ?? state.tierId, true)
        .field("Status", ready ? ":white_check_mark: Ready to harvest!" : `:hourglass: ${formatDuration(remaining)} remaining`, true)
        .footer(ready ? `Use /${actionType} harvest to collect` : "Come back when it's ready!")
        .build();

      return { success: true, embed: e };
    }

    if (sub === "info") {
      const playerLevel = await xp.getLevel(guildId, userId);
      const lines = tiers.map((t) => {
        const locked = playerLevel < t.requiredLevel ? " :lock:" : " :white_check_mark:";
        return `**${t.name}**${locked} — Lv.${t.requiredLevel} | ${formatDuration(t.cooldownMs)} | ${t.rewardMin}–${t.rewardMax} ${config.currencyName} | ${t.xpReward} XP | ${t.rareChance}% rare (${t.rareMultiplier}×)`;
      });

      const e = embed()
        .title(`${config.currencyEmoji} ${actionType.charAt(0).toUpperCase() + actionType.slice(1)} — Tiers`)
        .description(lines.join("\n"))
        .color(EmbedColors.INFO)
        .footer(`Your level: ${playerLevel}`)
        .build();

      return { success: true, embed: e };
    }

    return { success: false, error: `Please use a subcommand: start, harvest, status, or info.` };
  };
}

export const _internals = { formatDuration };
