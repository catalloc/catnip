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
 *   /server info                  — Show guild config summary
 *
 * File: discord/interactions/commands/server.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import { createAutocompleteResponse } from "../patterns.ts";

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
    if (!group || group.name !== "commands") return createAutocompleteResponse([]);

    const sub = group.options?.find(
      (o: any) => o.type === OptionTypes.SUB_COMMAND,
    );
    if (!sub) return createAutocompleteResponse([]);

    const focused = sub.options?.find((o: any) => o.focused);
    if (!focused || focused.name !== "command") return createAutocompleteResponse([]);

    const query = ((focused.value as string) || "").toLowerCase();
    const guildId = body.guild_id as string;
    const allGuildCommands = await getGuildRegistrableNames();
    const enabledCommands = await guildConfig.getEnabledCommands(guildId);

    if (sub.name === "enable") {
      // Show available commands, indicate which are already enabled
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
      // Only show enabled commands
      const choices = enabledCommands
        .filter((name) => name.toLowerCase().includes(query))
        .map((name) => ({ name, value: name }))
        .slice(0, 25);
      return createAutocompleteResponse(choices);
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

      // Register the command to this guild
      try {
        const reg = await getRegistration();
        await reg.registerCommandsToGuild(guildId, [commandName]);
      } catch {
        // Config is saved even if registration fails — next ?register=true will fix it
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

      // Deregister the command from this guild
      try {
        const reg = await getRegistration();
        await reg.deregisterCommandFromGuild(commandName, guildId);
      } catch {
        // Config is saved even if deregistration fails
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

    // --- info ---
    if (sub === "info") {
      const config = await guildConfig.get(guildId);
      const adminRoles = config?.adminRoleIds ?? [];
      const enabledCommands = config?.enabledCommands ?? [];

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
