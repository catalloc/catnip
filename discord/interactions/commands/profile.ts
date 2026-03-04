/**
 * Profile Command — View your or another player's character sheet
 *
 * File: discord/interactions/commands/profile.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { xp, makeXpBar } from "../../economy/xp.ts";
import { jobs, getTierConfig } from "../../economy/jobs.ts";
import { crimes } from "../../economy/crimes.ts";
import { profile } from "../../economy/profile.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "profile",
  description: "View a player's profile card",

  options: [
    {
      name: "user",
      description: "User to view (defaults to you)",
      type: OptionTypes.USER,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: true,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const targetId = (options?.user as string) ?? userId;
    const config = await economyConfig.get(guildId);

    // Fetch all data in parallel
    const [account, xpState, jobState, crimeState, profileData] = await Promise.all([
      accounts.getOrCreate(guildId, targetId, config.startingBalance),
      xp.getOrCreate(guildId, targetId),
      jobs.getOrCreate(guildId, targetId),
      crimes.getState(guildId, targetId),
      profile.getOrCreate(guildId, targetId),
    ]);

    const tier = getTierConfig(jobState.tierId);
    const xpBar = makeXpBar(xpState.xp);
    const borderColor = profileData.borderColor ?? EmbedColors.INFO;

    // Build description
    const lines: string[] = [];

    if (profileData.title) {
      lines.push(`*"${profileData.title}"*`);
    }

    lines.push("");
    lines.push(`**Level ${xpState.level}**`);
    lines.push(xpBar);

    const e = embed()
      .author(
        profileData.activeBadgeId
          ? `${profileData.activeBadgeId} <@${targetId}>`
          : `<@${targetId}>`,
      )
      .description(lines.join("\n"))
      .color(borderColor)
      .field("Balance", `${account.balance.toLocaleString()} ${config.currencyEmoji}`, true)
      .field("Job", tier.name, true)
      .field("Lifetime Earned", `${account.lifetimeEarned.toLocaleString()} ${config.currencyEmoji}`, true);

    if (crimeState) {
      e.field(
        "Crimes",
        `${crimeState.totalSuccesses}/${crimeState.totalAttempts} successful`,
        true,
      );
    }

    if (profileData.badgeIds.length > 0) {
      e.field("Badges", profileData.badgeIds.join(" "), false);
    }

    const createdDate = new Date(account.createdAt).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    e.footer(`Member since ${createdDate}`);

    return { success: true, embed: e.build() };
  },
});
