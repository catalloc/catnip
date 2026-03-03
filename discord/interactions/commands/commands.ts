/**
 * Commands - Admin command for managing slash command registration
 *
 * Subcommands:
 *   /commands register [command]    — Register a command (or all enabled) for THIS guild
 *   /commands unregister [command]  — Unregister a command (or all) from this guild
 *   /commands sync                  — Full cross-guild sync (global + all configured guilds)
 *   /commands list                  — Show registered vs expected commands for this guild
 *
 * File: discord/interactions/commands/commands.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import { EmbedColors } from "../../constants.ts";

// Lazy imports — registry.ts dynamically imports command files, so command
// files cannot statically import registry.ts or registration.ts (which
// itself imports registry.ts). All access is deferred to execute/autocomplete time.
async function getRegistration() {
  return await import("../registration.ts");
}

async function getGuildConfig() {
  return (await import("../../persistence/guild-config.ts")).guildConfig;
}

/** Commands eligible for registration (excludes this meta-command) */
async function registerableNames(): Promise<string[]> {
  const { getAllCommands } = await import("../registry.ts");
  return getAllCommands()
    .map((c) => c.name)
    .filter((n) => n !== "commands");
}

/** Build a results summary message */
function formatResults(
  summary: string,
  results: Array<{ command: string; success: boolean; error?: string; guildId?: string }>,
): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  let message = `${summary}\n\n`;
  message += `**Results:** ${successful.length} succeeded, ${failed.length} failed\n`;

  if (successful.length > 0 && successful.length <= 10) {
    message += `\n**Registered:**\n`;
    for (const r of successful) {
      message += `- \`${r.command}\` -> ${r.guildId ?? "unknown"}\n`;
    }
  }

  if (failed.length > 0) {
    message += `\n**Failed:**\n`;
    for (const r of failed) {
      message += `- \`${r.command}\`: ${r.error}\n`;
    }
  }

  return message;
}

export default defineCommand({
  name: "commands",
  description: "Admin: Manage slash command registration",

  options: [
    {
      name: "register",
      description: "Register commands for this guild",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "command",
          description: "Command to register (or 'all' for all enabled)",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "unregister",
      description: "Unregister commands from this guild",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "command",
          description: "Command to unregister (or 'all')",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "sync",
      description: "Full sync: global + all configured guilds",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "list",
      description: "Show registered vs expected commands for this guild",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "global" },
  adminOnly: true,

  async execute({ guildId, options }) {
    const sub = options?.subcommand as string | undefined;

    // --- register ---
    if (sub === "register") {
      const commandOption = options?.command as string;

      if (!commandOption) {
        return { success: false, error: "No command specified." };
      }

      if (!guildId) {
        return { success: false, error: "This subcommand must be used in a server." };
      }

      try {
        let results;
        let summary: string;

        const reg = await getRegistration();

        if (commandOption === "all") {
          // Bulk PUT all enabled commands for THIS guild + register global commands
          const globalResults = await reg.registerGlobalCommands();
          const guildResults = await reg.registerCommandsToGuild(guildId);
          results = [...globalResults, ...guildResults];
          summary = `Registered all commands for this guild (global + ${guildResults.length} guild)`;
        } else {
          const names = await registerableNames();
          if (!names.includes(commandOption)) {
            return { success: false, error: `Unknown command: ${commandOption}` };
          }
          results = await reg.registerCommand(commandOption, guildId);
          summary = `Registered **/${commandOption}**`;
        }

        return {
          success: results.every((r) => r.success),
          message: formatResults(summary, results),
          data: { results },
        };
      } catch (error) {
        return {
          success: false,
          error: `Registration failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // --- unregister ---
    if (sub === "unregister") {
      const commandOption = options?.command as string;

      if (!commandOption) {
        return { success: false, error: "No command specified." };
      }

      if (!guildId) {
        return { success: false, error: "This subcommand must be used in a server." };
      }

      const reg = await getRegistration();

      if (commandOption === "all") {
        const result = await reg.deregisterAllFromGuild(guildId);
        return result.success
          ? { success: true, message: `Removed all commands from this guild.` }
          : { success: false, error: result.error || "Failed to deregister commands" };
      }

      const result = await reg.deregisterCommandFromGuild(commandOption, guildId);
      return result.success
        ? { success: true, message: `Unregistered \`${commandOption}\` from this guild.` }
        : { success: false, error: result.error || `Failed to unregister ${commandOption}` };
    }

    // --- sync ---
    if (sub === "sync") {
      try {
        const reg = await getRegistration();
        const results = await reg.syncAllGuilds();
        return {
          success: results.every((r) => r.success),
          message: formatResults("Full sync: global + all configured guilds", results),
          data: { results },
        };
      } catch (error) {
        return {
          success: false,
          error: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // --- list ---
    if (sub === "list") {
      if (!guildId) {
        return { success: false, error: "This subcommand must be used in a server." };
      }

      try {
        const reg = await getRegistration();
        const gc = await getGuildConfig();

        const enabledCommands = await gc.getEnabledCommands(guildId);
        const registeredCommands = await reg.fetchRegisteredCommands(guildId);
        const registeredNames = new Set(registeredCommands.map((c) => c.name));

        const guildRegistrable = reg.getGuildRegistrableCommands().map((c) => c.name);
        const globalCommands = reg.getGlobalCommands().map((c) => c.name);

        const lines: string[] = [];

        // Global commands
        if (globalCommands.length > 0) {
          lines.push("**Global commands:**");
          for (const name of globalCommands) {
            lines.push(`  \`/${name}\` — global`);
          }
        }

        // Guild commands
        if (guildRegistrable.length > 0) {
          lines.push("", "**Guild commands:**");
          for (const name of guildRegistrable) {
            const enabled = enabledCommands.includes(name);
            const registered = registeredNames.has(name);

            let status: string;
            if (enabled && registered) {
              status = "enabled, registered";
            } else if (enabled && !registered) {
              status = "enabled, NOT registered";
            } else if (!enabled && registered) {
              status = "NOT enabled, registered (stale)";
            } else {
              status = "disabled";
            }
            lines.push(`  \`/${name}\` — ${status}`);
          }
        }

        // Unknown registered commands (not in registry)
        const knownNames = new Set([...globalCommands, ...guildRegistrable]);
        const unknownRegistered = registeredCommands.filter((c) => !knownNames.has(c.name));
        if (unknownRegistered.length > 0) {
          lines.push("", "**Unknown (registered but not in registry):**");
          for (const cmd of unknownRegistered) {
            lines.push(`  \`/${cmd.name}\` — unknown (stale)`);
          }
        }

        return {
          success: true,
          message: "",
          embed: {
            title: "Command Registration Status",
            description: lines.join("\n") || "No commands found.",
            color: EmbedColors.INFO,
            footer: { text: `${enabledCommands.length} enabled, ${registeredCommands.length} registered in this guild` },
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to list commands: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return { success: false, error: "Please use a subcommand: register, unregister, sync, or list" };
  },

  async autocomplete(body) {
    const subOption = body.data.options?.find(
      (o: any) => o.type === OptionTypes.SUB_COMMAND,
    );
    if (!subOption) return createAutocompleteResponse([]);

    const focusedOption = subOption.options?.find((o: any) => o.focused);
    if (!focusedOption) return createAutocompleteResponse([]);

    const query = ((focusedOption.value as string) || "").toLowerCase();
    const subName = subOption.name as string;
    const guildId = body.guild_id as string;

    if (subName === "register") {
      if (focusedOption.name === "command") {
        const reg = await getRegistration();
        const guildRegistrable = reg.getGuildRegistrableCommands().map((c) => c.name);
        const enabledCommands = guildId
          ? await (await getGuildConfig()).getEnabledCommands(guildId)
          : [];
        const enabledSet = new Set(enabledCommands);

        const choices = [
          { name: "All Commands (all enabled for this guild)", value: "all" },
          ...guildRegistrable.map((name) => ({
            name: enabledSet.has(name) ? `/${name} (enabled)` : `/${name} (not enabled)`,
            value: name,
          })),
        ]
          .filter((c) => c.name.toLowerCase().includes(query) || c.value.includes(query))
          .slice(0, 25);

        return createAutocompleteResponse(choices);
      }
    }

    if (subName === "unregister") {
      if (focusedOption.name === "command") {
        if (!guildId) {
          return createAutocompleteResponse([
            { name: "Must be used in a server", value: "_invalid" },
          ]);
        }

        const enabledCommands = await (await getGuildConfig()).getEnabledCommands(guildId);

        const choices = [
          { name: `all (remove all commands)`, value: "all" },
          ...enabledCommands.map((name) => ({ name, value: name })),
        ]
          .filter((c) => c.value === "all" || c.name.toLowerCase().includes(query))
          .slice(0, 25);

        return createAutocompleteResponse(choices);
      }
    }

    return createAutocompleteResponse([]);
  },
});
