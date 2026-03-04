/**
 * Job Command — Start shifts, collect earnings, view job info
 *
 * File: discord/interactions/commands/job.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { jobs, getTierConfig, shifts, DEFAULT_JOB_TIERS } from "../../economy/jobs.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { xp } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

export default defineCommand({
  name: "job",
  description: "Manage your job — start shifts and collect earnings",

  options: [
    {
      name: "start",
      description: "Start a work shift",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "collect",
      description: "Collect your shift earnings",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "status",
      description: "View your current shift progress",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "info",
      description: "View all job tiers and shift payouts",
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

    if (sub === "start") {
      const jobState = await jobs.getOrCreate(guildId, userId);
      const tier = getTierConfig(jobState.tierId);

      if (tier.shiftDurationMs === 0) {
        return { success: false, error: "You're unemployed! Buy a job upgrade from `/shop browse` first." };
      }

      // Acquire activity lock
      const lockResult = await activityLock.acquireLock(guildId, userId, "job", tier.name);
      if (!lockResult.success) return { success: false, error: lockResult.error };

      const result = await shifts.startShift(guildId, userId, jobState.tierId);
      if (!result.success) {
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: result.error };
      }

      const e = embed()
        .title(`${config.currencyEmoji} Job — ${tier.name}`)
        .color(EmbedColors.INFO)
        .description(`You started a shift as a **${tier.name}**! Come back in **${formatDuration(tier.shiftDurationMs)}** to collect **${tier.shiftPayout.toLocaleString()} ${config.currencyName}**.`)
        .footer("Use /job collect when your shift is done")
        .build();

      return { success: true, embed: e };
    }

    if (sub === "collect") {
      const result = await shifts.collectShift(guildId, userId);
      if (!result.success) return { success: false, error: result.error };

      // Release activity lock
      await activityLock.releaseLock(guildId, userId);

      const tier = getTierConfig(result.state!.tierId);
      const account = await accounts.creditBalance(guildId, userId, result.coins!);
      const xpResult = await xp.grantXp(guildId, userId, result.xpAmount!);
      const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! You're now Level ${xpResult.newLevel}!**` : "";

      const e = embed()
        .title(`${config.currencyEmoji} Job — Shift Complete!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `You completed your shift as a **${tier.name}** and earned **${result.coins!.toLocaleString()} ${config.currencyName}**!\n+${result.xpAmount} XP${levelUpMsg}`,
        )
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "status") {
      const shift = await shifts.getShift(guildId, userId);
      if (!shift || shift.collected) {
        return { success: true, message: "No active shift. Use `/job start` to begin a shift!" };
      }

      const tier = getTierConfig(shift.tierId);
      const now = Date.now();
      const ready = now >= shift.readyAt;
      const remaining = ready ? 0 : shift.readyAt - now;

      const e = embed()
        .title(`${config.currencyEmoji} Job Status`)
        .color(ready ? EmbedColors.SUCCESS : EmbedColors.INFO)
        .field("Job", tier.name, true)
        .field("Payout", `${tier.shiftPayout.toLocaleString()} ${config.currencyName}`, true)
        .field("Status", ready ? ":white_check_mark: Shift complete! Use `/job collect`" : `:hourglass: ${formatDuration(remaining)} remaining`, false)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "info") {
      const lines = DEFAULT_JOB_TIERS.filter((t) => t.id !== "unemployed").map((t) => {
        const price = t.shopPrice === 0 ? "Free" : `${t.shopPrice.toLocaleString()} ${config.currencyName}`;
        return `**${t.name}** — ${t.shiftPayout.toLocaleString()} ${config.currencyName} / ${formatDuration(t.shiftDurationMs)} (${price})`;
      });

      const e = embed()
        .title(`${config.currencyEmoji} Job Tiers`)
        .description(lines.join("\n"))
        .color(EmbedColors.INFO)
        .footer("Buy job upgrades from /shop browse")
        .build();

      return { success: true, embed: e };
    }

    return { success: false, error: "Please use a subcommand: start, collect, status, or info." };
  },
});
