/**
 * User Info - Context menu command showing user details
 *
 * File: discord/interactions/commands/user-info.ts
 */

import { defineCommand } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";

function snowflakeToDate(id: string): Date {
  const DISCORD_EPOCH = 1420070400000n;
  return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
}

export default defineCommand({
  name: "User Info",
  description: "",
  type: 2, // USER context menu

  registration: { type: "guild" },
  deferred: false,

  async execute({ targetId, resolved }) {
    if (!targetId || !resolved) {
      return { success: false, error: "No user selected." };
    }

    const user = resolved.users?.[targetId];
    const member = resolved.members?.[targetId];
    const username = user?.username ?? "Unknown";
    const displayName = user?.global_name ?? member?.nick ?? username;
    const created = snowflakeToDate(targetId);

    return {
      success: true,
      message: "",
      embed: {
        title: displayName,
        color: EmbedColors.INFO,
        fields: [
          { name: "Username", value: username, inline: true },
          { name: "ID", value: targetId, inline: true },
          { name: "Created", value: `<t:${Math.floor(created.getTime() / 1000)}:R>`, inline: true },
        ],
        thumbnail: user?.avatar
          ? { url: `https://cdn.discordapp.com/avatars/${targetId}/${user.avatar}.png?size=128` }
          : undefined,
      },
    };
  },
});
