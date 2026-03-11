/**
 * Profile Command — View your or another player's profile card
 *
 * File: discord/interactions/commands/profile.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../games/accounts.ts";
import { gamesConfig } from "../../games/games-config.ts";
import { xp, makeXpBar } from "../../games/xp.ts";
import { profile } from "../../games/profile.ts";
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
    const config = await gamesConfig.get(guildId);

    // Fetch all data in parallel
    const [account, xpState, profileData] = await Promise.all([
      accounts.getOrCreate(guildId, targetId, config.startingBalance),
      xp.getOrCreate(guildId, targetId),
      profile.getOrCreate(guildId, targetId),
    ]);

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
      .field("Lifetime Earned", `${account.lifetimeEarned.toLocaleString()} ${config.currencyEmoji}`, true);

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
