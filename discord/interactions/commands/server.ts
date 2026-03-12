/**
 * Server - Per-guild configuration management
 *
 * Subcommand groups:
 *   /server admin add <role>      — Add an admin role
 *   /server admin remove <role>   — Remove an admin role
 *   /server admin list            — Show admin roles
 *   /server commands enable <command>  — Enable a command for this guild
 *   /server commands disable <command> — Disable a command for this guild
 *   /server commands list         — Show enabled/available commands
 *   /server logging mute <path>   — Mute routine webhook logs for a path
 *   /server logging unmute <path> — Unmute webhook logs for a path
 *   /server logging list          — Show muted log paths
 *   /server info                  — Show guild config summary
 *
 * File: discord/interactions/commands/server.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import { logConfig } from "../../persistence/log-config.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import { createLogger } from "../../webhook/logger.ts";

const logger = createLogger("Server");

const KNOWN_CRON_PATHS = [
  "cron:reminders",
  "cron:giveaways",
  "cron:polls",
  "cron:tickets",
  "cron:livestreams",
  "cron:scheduled-messages",
];

// Lazy imports to avoid circular deps with registry
async function getRegistration() {
  return await import("../registration.ts");
}

async function getGuildRegistrableNames(): Promise<string[]> {
  const reg = await getRegistration();
  return reg.getGuildRegistrableCommands().map((c) => c.name);
}

export default defineCommand({
  name: "server",
  description: "Configure bot settings for this server",

  options: [
    {
      name: "admin",
      description: "Manage admin roles",
      type: OptionTypes.SUB_COMMAND_GROUP,
      required: false,
      options: [
        {
          name: "add",
          description: "Add an admin role",
          type: OptionTypes.SUB_COMMAND,
          required: false,
          options: [
            {
              name: "role",
              description: "The role to add as admin",
              type: OptionTypes.ROLE,
              required: true,
            },
          ],
        },
        {
          name: "remove",
          description: "Remove an admin role",
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
          description: "Show admin roles",
          type: OptionTypes.SUB_COMMAND,
          required: false,
        },
      ],
    },
    {
      name: "commands",
      description: "Manage enabled commands",
      type: OptionTypes.SUB_COMMAND_GROUP,
      required: false,
      options: [
        {
          name: "enable",
          description: "Enable a command for this server",
          type: OptionTypes.SUB_COMMAND,
          required: false,
          options: [
            {
              name: "command",
              description: "Command to enable",
              type: OptionTypes.STRING,
              required: true,
              autocomplete: true,
            },
          ],
        },
        {
          name: "disable",
          description: "Disable a command for this server",
          type: OptionTypes.SUB_COMMAND,
          required: false,
          options: [
            {
              name: "command",
              description: "Command to disable",
              type: OptionTypes.STRING,
              required: true,
              autocomplete: true,
            },
          ],
        },
        {
          name: "list",
          description: "Show enabled/available commands",
          type: OptionTypes.SUB_COMMAND,
          required: false,
        },
      ],
    },
    {
      name: "logging",
      description: "Manage webhook console log muting",
      type: OptionTypes.SUB_COMMAND_GROUP,
      required: false,
      options: [
        {
          name: "mute",
          description: "Mute routine logs for a command or cron path",
          type: OptionTypes.SUB_COMMAND,
          required: false,
          options: [
            {
              name: "path",
              description: "Path to mute (e.g. cmd:games, cron:reminders)",
              type: OptionTypes.STRING,
              required: true,
              autocomplete: true,
            },
          ],
        },
        {
          name: "unmute",
          description: "Unmute logs for a command or cron path",
          type: OptionTypes.SUB_COMMAND,
          required: false,
          options: [
            {
              name: "path",
              description: "Path to unmute",
              type: OptionTypes.STRING,
              required: true,
              autocomplete: true,
            },
          ],
        },
        {
          name: "list",
          description: "Show all muted log paths",
          type: OptionTypes.SUB_COMMAND,
          required: false,
        },
      ],
    },
    {
      name: "info",
      description: "Show server configuration summary",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "global" },
  adminOnly: true,
  deferred: false,

  async autocomplete(body) {
    const group = body.data.options?.find(
      (o: any) => o.type === OptionTypes.SUB_COMMAND_GROUP,
    );
    if (!group) return createAutocompleteResponse([]);

    const sub = group.options?.find(
      (o: any) => o.type === OptionTypes.SUB_COMMAND,
    );
    if (!sub) return createAutocompleteResponse([]);

    const focused = sub.options?.find((o: any) => o.focused);
    if (!focused) return createAutocompleteResponse([]);

    const query = ((focused.value as string) || "").toLowerCase();

    // --- commands group ---
    if (group.name === "commands" && focused.name === "command") {
      const guildId = body.guild_id as string;
      const allGuildCommands = await getGuildRegistrableNames();
      const enabledCommands = await guildConfig.getEnabledCommands(guildId);

      if (sub.name === "enable") {
        const choices = allGuildCommands
          .filter((name) => name.toLowerCase().includes(query))
          .map((name) => ({
            name: enabledCommands.includes(name) ? `${name} (already enabled)` : name,
            value: name,
          }))
          .slice(0, 25);
        return createAutocompleteResponse(choices);
      }

      if (sub.name === "disable") {
        const choices = enabledCommands
          .filter((name) => name.toLowerCase().includes(query))
          .map((name) => ({ name, value: name }))
          .slice(0, 25);
        return createAutocompleteResponse(choices);
      }
    }

    // --- logging group ---
    if (group.name === "logging" && focused.name === "path") {
      if (sub.name === "mute") {
        // Suggest all known command + cron paths, mark already-muted ones
        const { getAllCommands } = await import("../registry.ts");
        const cmdPaths = getAllCommands().map((c) => `cmd:${c.name}`);
        const allPaths = [...cmdPaths, ...KNOWN_CRON_PATHS];
        const mutedPaths = await logConfig.getMutedPaths();
        const mutedSet = new Set(mutedPaths);

        const choices = allPaths
          .filter((p) => p.includes(query))
          .map((p) => ({
            name: mutedSet.has(p) ? `${p} (already muted)` : p,
            value: p,
          }))
          .slice(0, 25);
        return createAutocompleteResponse(choices);
      }

      if (sub.name === "unmute") {
        // Only show currently muted paths
        const mutedPaths = await logConfig.getMutedPaths();
        const choices = mutedPaths
          .filter((p) => p.includes(query))
          .map((p) => ({ name: p, value: p }))
          .slice(0, 25);
        return createAutocompleteResponse(choices);
      }
    }

    return createAutocompleteResponse([]);
  },

  async execute({ guildId, options }) {
    const sub = options?.subcommand as string | undefined;

    // --- admin:add ---
    if (sub === "admin:add") {
      const roleId = options.role as string;
      const currentRoles = await guildConfig.getAdminRoleIds(guildId);
      if (currentRoles.includes(roleId)) {
        return { success: false, error: `<@&${roleId}> is already an admin role.` };
      }
      const { MAX_ADMIN_ROLES } = await import("../../persistence/guild-config.ts");
      if (currentRoles.length >= MAX_ADMIN_ROLES) {
        return { success: false, error: `Maximum of ${MAX_ADMIN_ROLES} admin roles reached.` };
      }
      await guildConfig.addAdminRole(guildId, roleId);
      return { success: true, message: `Added <@&${roleId}> as an admin role.` };
    }

    // --- admin:remove ---
    if (sub === "admin:remove") {
      const roleId = options.role as string;
      const removed = await guildConfig.removeAdminRole(guildId, roleId);
      return removed
        ? { success: true, message: `Removed <@&${roleId}> from admin roles.` }
        : { success: false, error: `<@&${roleId}> is not an admin role.` };
    }

    // --- admin:list ---
    if (sub === "admin:list") {
      const roleIds = await guildConfig.getAdminRoleIds(guildId);
      if (roleIds.length === 0) {
        return { success: true, message: "No admin roles configured. Use `/server admin add` to add one." };
      }
      return {
        success: true,
        message: "",
        embed: {
          title: "Admin Roles",
          description: roleIds.map((id) => `<@&${id}>`).join("\n"),
          color: EmbedColors.INFO,
          footer: { text: `${roleIds.length} admin role${roleIds.length !== 1 ? "s" : ""}` },
        },
      };
    }

    // --- commands:enable ---
    if (sub === "commands:enable") {
      const commandName = options.command as string;
      const allGuildCommands = await getGuildRegistrableNames();

      if (!allGuildCommands.includes(commandName)) {
        return { success: false, error: `Unknown guild command: \`${commandName}\`` };
      }

      const enabled = await guildConfig.enableCommand(guildId, commandName);
      if (!enabled) {
        return { success: false, error: `\`${commandName}\` is already enabled.` };
      }

      // Bulk PUT all enabled commands (including the newly enabled one)
      try {
        const reg = await getRegistration();
        await reg.registerCommandsToGuild(guildId);
      } catch (err) {
        logger.warn(`Failed to sync commands for guild ${guildId}: ${err instanceof Error ? err.message : String(err)}`);
        return { success: true, message: `Enabled \`/${commandName}\` for this server.\n⚠️ Command registration failed — it will be registered on next \`/commands sync\`.` };
      }

      return { success: true, message: `Enabled \`/${commandName}\` for this server.` };
    }

    // --- commands:disable ---
    if (sub === "commands:disable") {
      const commandName = options.command as string;
      const disabled = await guildConfig.disableCommand(guildId, commandName);
      if (!disabled) {
        return { success: false, error: `\`${commandName}\` is not enabled.` };
      }

      // Bulk PUT remaining enabled commands (excluding the disabled one)
      try {
        const reg = await getRegistration();
        await reg.registerCommandsToGuild(guildId);
      } catch (err) {
        logger.warn(`Failed to sync commands for guild ${guildId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      return { success: true, message: `Disabled \`/${commandName}\` for this server.` };
    }

    // --- commands:list ---
    if (sub === "commands:list") {
      const allGuildCommands = await getGuildRegistrableNames();
      const enabledCommands = await guildConfig.getEnabledCommands(guildId);

      const lines = allGuildCommands.map((name) => {
        const status = enabledCommands.includes(name) ? "enabled" : "disabled";
        return `\`/${name}\` — ${status}`;
      });

      return {
        success: true,
        message: "",
        embed: {
          title: "Guild Commands",
          description: lines.join("\n") || "No guild commands available.",
          color: EmbedColors.INFO,
          footer: { text: `${enabledCommands.length}/${allGuildCommands.length} enabled` },
        },
      };
    }

    // --- logging:mute ---
    if (sub === "logging:mute") {
      const path = (options.path as string).toLowerCase().trim();
      if (!path.startsWith("cmd:") && !path.startsWith("cron:")) {
        return { success: false, error: "Path must start with `cmd:` or `cron:`." };
      }
      const added = await logConfig.addMutedPath(path);
      return added
        ? { success: true, message: `Muted \`${path}\` — routine logs will be suppressed from webhook console.` }
        : { success: false, error: `\`${path}\` is already muted.` };
    }

    // --- logging:unmute ---
    if (sub === "logging:unmute") {
      const path = (options.path as string).toLowerCase().trim();
      const removed = await logConfig.removeMutedPath(path);
      return removed
        ? { success: true, message: `Unmuted \`${path}\` — logs will appear in webhook console again.` }
        : { success: false, error: `\`${path}\` is not muted.` };
    }

    // --- logging:list ---
    if (sub === "logging:list") {
      const mutedPaths = await logConfig.getMutedPaths();
      if (mutedPaths.length === 0) {
        return { success: true, message: "No paths are muted. Use `/server logging mute` to quiet a path." };
      }
      return {
        success: true,
        message: "",
        embed: {
          title: "Muted Log Paths",
          description: mutedPaths.map((p) => `\`${p}\``).join("\n"),
          color: EmbedColors.INFO,
          footer: { text: `${mutedPaths.length} path${mutedPaths.length !== 1 ? "s" : ""} muted — warnings and errors still logged` },
        },
      };
    }

    // --- info ---
    if (sub === "info") {
      const config = await guildConfig.get(guildId);
      const adminRoles = config?.adminRoleIds ?? [];
      const enabledCommands = config?.enabledCommands ?? [];
      const mutedPaths = await logConfig.getMutedPaths();

      const fields = [
        {
          name: "Admin Roles",
          value: adminRoles.length > 0
            ? adminRoles.map((id) => `<@&${id}>`).join(", ")
            : "None configured",
          inline: true,
        },
        {
          name: "Enabled Commands",
          value: enabledCommands.length > 0
            ? enabledCommands.map((n) => `\`${n}\``).join(", ")
            : "None enabled",
          inline: true,
        },
        {
          name: "Muted Log Paths",
          value: mutedPaths.length > 0
            ? mutedPaths.map((p) => `\`${p}\``).join(", ")
            : "None",
          inline: false,
        },
      ];

      return {
        success: true,
        message: "",
        embed: {
          title: "Server Configuration",
          color: EmbedColors.INFO,
          fields,
          footer: { text: config ? `Last updated: ${config.updatedAt}` : "Not configured yet" },
        },
      };
    }

    return { success: false, error: "Please use a subcommand." };
  },
});
