/**
 * React-Roles - Admin command for self-assignable role panels
 *
 * Subcommands:
 *   /react-roles add <role> <emoji> <label>
 *   /react-roles remove <role>
 *   /react-roles list
 *   /react-roles send <channel>
 *   /react-roles clear
 *
 * File: discord/interactions/commands/react-roles.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { discordBotFetch } from "../../discord-api.ts";

interface RoleEntry {
  roleId: string;
  emoji: string;
  label: string;
}

interface ReactRolesConfig {
  channelId?: string;
  messageId?: string;
  roles: RoleEntry[];
}

const MAX_ROLES = 25;

function kvKey(guildId: string): string {
  return `react-roles:${guildId}`;
}

async function getConfig(guildId: string): Promise<ReactRolesConfig> {
  return (await kv.get<ReactRolesConfig>(kvKey(guildId))) ?? { roles: [] };
}

function buildPanelEmbed(roles: RoleEntry[]) {
  return {
    title: "Role Selection",
    description: roles
      .map((r) => `${r.emoji} **${r.label}** — <@&${r.roleId}>`)
      .join("\n"),
    color: EmbedColors.INFO,
  };
}

function buildPanelComponents(roles: RoleEntry[]) {
  const buttons = roles.map((r) => ({
    type: 2, // BUTTON
    style: 2, // SECONDARY (gray)
    label: r.label,
    emoji: parseEmoji(r.emoji),
    custom_id: `react-role:${r.roleId}`,
  }));

  // Split into rows of 5 (Discord limit)
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  }
  return rows;
}

function parseEmoji(raw: string): { name: string; id?: string } | undefined {
  // Custom emoji: <:name:id> or <a:name:id>
  const custom = raw.match(/^<a?:(\w+):(\d+)>$/);
  if (custom) return { name: custom[1], id: custom[2] };
  // Unicode emoji
  return { name: raw };
}

export default defineCommand({
  name: "react-roles",
  description: "Admin: Configure self-assignable role panels",

  options: [
    {
      name: "add",
      description: "Add a role to the panel",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "role",
          description: "The role to add",
          type: OptionTypes.ROLE,
          required: true,
        },
        {
          name: "emoji",
          description: "Emoji for the button (e.g. 🎮 or <:custom:123>)",
          type: OptionTypes.STRING,
          required: true,
        },
        {
          name: "label",
          description: "Button label text",
          type: OptionTypes.STRING,
          required: true,
        },
      ],
    },
    {
      name: "remove",
      description: "Remove a role from the panel",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "role",
          description: "The role to remove",
          type: OptionTypes.ROLE,
          required: true,
        },
      ],
    },
    {
      name: "list",
      description: "Show the current role panel configuration",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "send",
      description: "Send or update the role panel in a channel",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "channel",
          description: "Channel to send the panel to",
          type: OptionTypes.CHANNEL,
          required: true,
        },
      ],
    },
    {
      name: "clear",
      description: "Delete all react-role configuration",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  adminOnly: true,

  async execute({ guildId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "add") {
      const roleId = options.role as string;
      const emoji = options.emoji as string;
      const label = options.label as string;

      const config = await getConfig(guildId);

      if (config.roles.length >= MAX_ROLES) {
        return { success: false, error: `Maximum of ${MAX_ROLES} roles reached (Discord button limit).` };
      }

      if (config.roles.some((r) => r.roleId === roleId)) {
        return { success: false, error: `<@&${roleId}> is already configured.` };
      }

      config.roles.push({ roleId, emoji, label });
      await kv.set(kvKey(guildId), config);

      return {
        success: true,
        action: "added",
        message: `Added ${emoji} **${label}** (<@&${roleId}>) to the panel. (${config.roles.length}/${MAX_ROLES})`,
      };
    }

    if (sub === "remove") {
      const roleId = options.role as string;
      const config = await getConfig(guildId);

      const index = config.roles.findIndex((r) => r.roleId === roleId);
      if (index === -1) {
        return { success: false, error: `<@&${roleId}> is not in the panel.` };
      }

      config.roles.splice(index, 1);
      await kv.set(kvKey(guildId), config);

      return {
        success: true,
        action: "removed",
        message: `Removed <@&${roleId}> from the panel. (${config.roles.length}/${MAX_ROLES})`,
      };
    }

    if (sub === "list") {
      const config = await getConfig(guildId);

      if (config.roles.length === 0) {
        return { success: true, message: "No roles configured. Use `/react-roles add` to get started." };
      }

      return {
        success: true,
        message: "",
        embed: {
          title: "React-Roles Configuration",
          description: config.roles
            .map((r, i) => `${i + 1}. ${r.emoji} **${r.label}** — <@&${r.roleId}>`)
            .join("\n"),
          color: EmbedColors.INFO,
          footer: {
            text: `${config.roles.length}/${MAX_ROLES} roles${config.messageId ? ` · Panel posted in <#${config.channelId}>` : ""}`,
          },
        },
      };
    }

    if (sub === "send") {
      const channelId = options.channel as string;
      const config = await getConfig(guildId);

      if (config.roles.length === 0) {
        return { success: false, error: "No roles configured. Use `/react-roles add` first." };
      }

      const payload = {
        embeds: [buildPanelEmbed(config.roles)],
        components: buildPanelComponents(config.roles),
      };

      // If we already have a message, try to PATCH it
      if (config.messageId && config.channelId) {
        const patch = await discordBotFetch(
          "PATCH",
          `channels/${config.channelId}/messages/${config.messageId}`,
          payload,
        );

        if (patch.ok) {
          // Update channel if it changed
          if (config.channelId !== channelId) {
            config.channelId = channelId;
            await kv.set(kvKey(guildId), config);
          }
          return { success: true, message: "Panel updated." };
        }

        // If 404 (message deleted), fall through to POST
        if (patch.status !== 404) {
          console.error(`[react-roles] Failed to update panel: ${patch.error}`);
          return { success: false, error: "Failed to update panel. The bot may lack permissions in that channel." };
        }
      }

      // POST new message
      const post = await discordBotFetch(
        "POST",
        `channels/${channelId}/messages`,
        payload,
      );

      if (!post.ok) {
        console.error(`[react-roles] Failed to send panel: ${post.error}`);
        return { success: false, error: "Failed to send panel. The bot may lack permissions in that channel." };
      }

      config.channelId = channelId;
      config.messageId = post.data.id;
      await kv.set(kvKey(guildId), config);

      return { success: true, message: `Panel sent to <#${channelId}>.` };
    }

    if (sub === "clear") {
      await kv.delete(kvKey(guildId));
      return { success: true, action: "cleared", message: "React-roles configuration deleted." };
    }

    return { success: false, error: "Please use a subcommand: add, remove, list, send, or clear." };
  },
});
