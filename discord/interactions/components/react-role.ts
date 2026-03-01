/**
 * React-Role Button Handler
 *
 * Toggles a role when a user clicks a react-role panel button.
 * File: discord/interactions/components/react-role.ts
 */

import { defineComponent } from "../define-component.ts";
import { discordBotFetch } from "../../discord-api.ts";
import { kv } from "../../persistence/kv.ts";

interface ReactRolesConfig {
  roles: Array<{ roleId: string }>;
}

export default defineComponent({
  customId: "react-role:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId, interaction }) {
    const roleId = customId.split(":")[1];
    if (!roleId) {
      return { success: false, error: "Invalid role button." };
    }

    // Verify the roleId is in the guild's configured react-roles
    const config = await kv.get<ReactRolesConfig>(`react-roles:${guildId}`);
    if (!config || !config.roles.some((r) => r.roleId === roleId)) {
      return { success: false, error: "This role is no longer available." };
    }

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
