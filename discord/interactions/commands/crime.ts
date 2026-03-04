/**
 * Crime Command — Commit crimes for coins (or get fined)
 *
 * File: discord/interactions/commands/crime.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { crimes, getCrimeDefinition, rollCrime, crimeXpAward, CRIME_DEFINITIONS } from "../../economy/crimes.ts";
import { xp, makeXpBar } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";
import type { CrimeId } from "../../economy/types.ts";

function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

export default defineCommand({
  name: "crime",
  description: "Commit a crime for coins — but you might get fined",

  options: [
    {
      name: "type",
      description: "Type of crime to commit",
      type: OptionTypes.STRING,
      required: true,
      choices: CRIME_DEFINITIONS.map((c) => ({ name: c.name, value: c.id })),
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const crimeId = options?.type as CrimeId;
    const config = await economyConfig.get(guildId);

    if (!config.crimeEnabled) {
      return { success: false, error: "Crime is disabled in this server." };
    }

    // Activity lock check — crime is instant, can't do during ongoing activity
    const lockCheck = await activityLock.requireNoActivity(guildId, userId);
    if (!lockCheck.allowed) return { success: false, error: lockCheck.error };

    const crime = getCrimeDefinition(crimeId);
    if (!crime) return { success: false, error: "Unknown crime type." };

    // Check level requirement
    const playerLevel = await xp.getLevel(guildId, userId);
    if (playerLevel < crime.requiredLevel) {
      return { success: false, error: `You need to be **Level ${crime.requiredLevel}** to attempt **${crime.name}**. You're Level ${playerLevel}.` };
    }

    // Check cooldown
    const cooldownRemaining = await crimes.getCooldownRemaining(guildId, userId);
    if (cooldownRemaining > 0) {
      return {
        success: false,
        error: `You're laying low! Try again in **${formatDuration(cooldownRemaining)}**.`,
      };
    }

    const outcome = rollCrime(crime);
    await crimes.recordAttempt(guildId, userId, outcome.success, outcome.cooldownMs);

    // Grant XP
    const xpAmount = crimeXpAward(crimeId, outcome.success);
    const xpResult = await xp.grantXp(guildId, userId, xpAmount);
    const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! You're now Level ${xpResult.newLevel}!**` : "";

    if (outcome.success) {
      const account = await accounts.creditBalance(guildId, userId, outcome.amount);
      const e = embed()
        .title(`${config.currencyEmoji} Crime — ${crime.name}`)
        .color(EmbedColors.SUCCESS)
        .description(
          `You successfully committed **${crime.name}** and got away with **${outcome.amount.toLocaleString()} ${config.currencyName}**!\n+${xpAmount} XP${levelUpMsg}`,
        )
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName} • Cooldown: ${formatDuration(outcome.cooldownMs)}`)
        .build();

      return { success: true, embed: e };
    }

    // Failed — apply fine if enabled
    if (config.crimeFineEnabled) {
      const { account } = await accounts.debitBalance(guildId, userId, outcome.amount);
      const e = embed()
        .title(`${config.currencyEmoji} Crime — ${crime.name}`)
        .color(EmbedColors.ERROR)
        .description(
          `You got caught attempting **${crime.name}** and were fined **${outcome.amount.toLocaleString()} ${config.currencyName}**!\n+${xpAmount} XP${levelUpMsg}`,
        )
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName} • Cooldown: ${formatDuration(outcome.cooldownMs)}`)
        .build();

      return { success: true, embed: e };
    }

    // Fines disabled — just fail
    const account = await accounts.getOrCreate(guildId, userId);
    const e = embed()
      .title(`${config.currencyEmoji} Crime — ${crime.name}`)
      .color(EmbedColors.ERROR)
      .description(`You got caught attempting **${crime.name}** but escaped without a fine.\n+${xpAmount} XP${levelUpMsg}`)
      .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName} • Cooldown: ${formatDuration(outcome.cooldownMs)}`)
      .build();

    return { success: true, embed: e };
  },
});

export const _internals = { formatDuration };
