/**
 * Leaderboard Command — Top coin holders in the server
 *
 * File: discord/interactions/commands/leaderboard.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { xp } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

const PAGE_SIZE = 10;

export default defineCommand({
  name: "leaderboard",
  description: "View the top coin holders",

  options: [
    {
      name: "page",
      description: "Page number (default: 1)",
      type: OptionTypes.INTEGER,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: true,
  ephemeral: false,

  async execute({ guildId, options }) {
    const page = Math.max(1, (options?.page as number) ?? 1);
    const config = await economyConfig.get(guildId);
    const allAccounts = await accounts.listAccounts(guildId);

    if (allAccounts.length === 0) {
      return { success: true, message: "No one has any coins yet!" };
    }

    const totalPages = Math.ceil(allAccounts.length / PAGE_SIZE);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const pageAccounts = allAccounts.slice(start, start + PAGE_SIZE);

    // Fetch levels for users on this page
    const levelMap = new Map<string, number>();
    await Promise.all(
      pageAccounts.map(async (a) => {
        const level = await xp.getLevel(guildId, a.userId);
        levelMap.set(a.userId, level);
      }),
    );

    const lines = pageAccounts.map((a, i) => {
      const rank = start + i + 1;
      const medal = rank === 1 ? " :first_place:" : rank === 2 ? " :second_place:" : rank === 3 ? " :third_place:" : "";
      const lvl = levelMap.get(a.userId) ?? 0;
      return `**${rank}.** <@${a.userId}> Lv.${lvl} — **${a.balance.toLocaleString()}** ${config.currencyName}${medal}`;
    });

    const e = embed()
      .title(`${config.currencyEmoji} Leaderboard`)
      .description(lines.join("\n"))
      .color(EmbedColors.INFO)
      .footer(`Page ${safePage}/${totalPages} • ${allAccounts.length} total users`)
      .build();

    return { success: true, embed: e };
  },
});

export const _internals = { PAGE_SIZE };
