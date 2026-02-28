/**
 * React-Role Button Handler
 *
 * Toggles a role when a user clicks a react-role panel button.
 * File: discord/interactions/components/react-role.ts
 */

import { defineComponent } from "../define-component.ts";
import { discordBotFetch } from "../../discord-api.ts";

export default defineComponent({
  customId: "react-role:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId, interaction }) {
    const roleId = customId.split(":")[1];
    const memberRoles: string[] = interaction.member?.roles ?? [];
    const hasRole = memberRoles.includes(roleId);

    const method = hasRole ? "DELETE" : "PUT";
    const result = await discordBotFetch(
      method,
      `guilds/${guildId}/members/${userId}/roles/${roleId}`,
    );

    if (!result.ok) {
      return { success: false, error: "Failed to update your roles. The bot may lack permissions." };
    }

    return {
      success: true,
      message: hasRole
        ? `Removed <@&${roleId}>.`
        : `Added <@&${roleId}>!`,
    };
  },
});
