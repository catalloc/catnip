/**
 * Job Command — View status, collect earnings, browse job tiers
 *
 * File: discord/interactions/commands/job.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { jobs, getTierConfig, computeEarnings, DEFAULT_JOB_TIERS } from "../../economy/jobs.ts";
import { xp, XP_AWARDS } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "job",
  description: "Manage your job — earn coins over time",

  options: [
    {
      name: "status",
      description: "View your current job and pending earnings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "collect",
      description: "Collect your accumulated earnings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "info",
      description: "View all available job tiers",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (!config.jobsEnabled) {
      return { success: false, error: "Jobs are disabled in this server." };
    }

    if (sub === "status") {
      const state = await jobs.getOrCreate(guildId, userId);
      const tier = getTierConfig(state.tierId);
      const { hours, coins } = computeEarnings(state.lastCollectedAt, tier.hourlyRate);

      const e = embed()
        .title(`${config.currencyEmoji} Job Status`)
        .color(EmbedColors.INFO)
        .field("Current Job", tier.name, true)
        .field("Hourly Rate", `${tier.hourlyRate} ${config.currencyName}/hr`, true)
        .field("Pending Earnings", `${coins.toLocaleString()} ${config.currencyName} (${hours}h)`, false)
        .footer("Use /job collect to claim your earnings")
        .build();

      return { success: true, embed: e };
    }

    if (sub === "collect") {
      const state = await jobs.getOrCreate(guildId, userId);
      const tier = getTierConfig(state.tierId);

      if (tier.hourlyRate === 0) {
        return { success: false, error: "You're unemployed! Buy a job upgrade from `/shop browse` first." };
      }

      const { hours, coins } = await jobs.collect(guildId, userId);

      if (coins === 0) {
        return { success: false, error: "No earnings to collect yet. Check back in a bit!" };
      }

      const account = await accounts.creditBalance(guildId, userId, coins);

      // Grant XP based on hours worked
      const xpAmount = hours * XP_AWARDS.JOB_COLLECT_PER_HOUR;
      const xpResult = await xp.grantXp(guildId, userId, xpAmount);
      const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! You're now Level ${xpResult.newLevel}!**` : "";

      return {
        success: true,
        message: `${config.currencyEmoji} Collected **${coins.toLocaleString()} ${config.currencyName}** from ${hours} hour(s) of work as a **${tier.name}**!\nNew balance: **${account.balance.toLocaleString()} ${config.currencyName}** (+${xpAmount} XP)${levelUpMsg}`,
      };
    }

    if (sub === "info") {
      const lines = DEFAULT_JOB_TIERS.map((t) => {
        const price = t.shopPrice === 0 ? "Free" : `${t.shopPrice.toLocaleString()} ${config.currencyName}`;
        return `**${t.name}** — ${t.hourlyRate} ${config.currencyName}/hr (${price})`;
      });

      const e = embed()
        .title(`${config.currencyEmoji} Job Tiers`)
        .description(lines.join("\n"))
        .color(EmbedColors.INFO)
        .footer("Buy job upgrades from /shop browse")
        .build();

      return { success: true, embed: e };
    }

    return { success: false, error: "Please use a subcommand: status, collect, or info." };
  },
});
