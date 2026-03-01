/**
 * Commands - Admin command for registering/unregistering slash commands
 *
 * Subcommands:
 *   /commands register [command]    — Register a command (or all)
 *   /commands unregister [command]  — Unregister a command (or all) from this guild
 *
 * File: discord/interactions/commands/commands.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { createAutocompleteResponse } from "../patterns.ts";

// Lazy imports — registry.ts dynamically imports command files, so command
// files cannot statically import registry.ts or registration.ts (which
// itself imports registry.ts). All access is deferred to execute/autocomplete time.
async function getRegistration() {
  return await import("../registration.ts");
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

  if (successful.length > 0 && successful.length <= 5) {
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

// Autocomplete cache for unregister (30s TTL)
const autocompleteCache = new Map<
  string,
  { data: Array<{ id: string; name: string; description: string }>; expiry: number }
>();
const CACHE_TTL_MS = 30_000;

function getCachedCommands(
  guildId: string,
): Array<{ id: string; name: string; description: string }> | null {
  const entry = autocompleteCache.get(guildId);
  if (entry && Date.now() < entry.expiry) return entry.data;
  autocompleteCache.delete(guildId);
  return null;
}

async function autocompleteCommandChoices(query: string) {
  const names = await registerableNames();
  return [
    { name: "All Commands", value: "all" },
    ...names.map((cmd) => ({ name: `/${cmd}`, value: cmd })),
  ].filter(
    (c) => c.name.toLowerCase().includes(query) || c.value.includes(query),
  );
}

export default defineCommand({
  name: "commands",
  description: "Admin: Manage slash command registration",

  options: [
    {
      name: "register",
      description: "Register slash commands with Discord",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "command",
          description: "Command to register (or 'all')",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "unregister",
      description: "Unregister slash commands from this guild",
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
  ],

  registration: { type: "global" },
  adminOnly: true,

  async execute({ guildId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "register") {
      const commandOption = options?.command as string;

      if (!commandOption) {
        return { success: false, error: "No command specified." };
      }

      try {
        let results;
        let summary: string;

        const reg = await getRegistration();

        if (commandOption === "all") {
          results = await reg.registerAllCommandsFromRegistry();
          summary = `Registered all commands (global + per-guild)`;
        } else {
          const names = await registerableNames();
          if (!names.includes(commandOption)) {
            return { success: false, error: `Unknown command: ${commandOption}` };
          }
          results = await reg.registerCommand(commandOption);
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

    return { success: false, error: "Please use a subcommand: register or unregister" };
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

    if (subName === "register") {
      if (focusedOption.name === "command") {
        return createAutocompleteResponse(await autocompleteCommandChoices(query));
      }
    }

    if (subName === "unregister") {
      if (focusedOption.name === "command") {
        const guildId = body.guild_id as string;
        if (!guildId) {
          return createAutocompleteResponse([
            { name: "Must be used in a server", value: "_invalid" },
          ]);
        }

        try {
          let registeredCommands = getCachedCommands(guildId);
          if (!registeredCommands) {
            const reg = await getRegistration();
            registeredCommands = await reg.fetchRegisteredCommands(guildId);
            autocompleteCache.set(guildId, {
              data: registeredCommands,
              expiry: Date.now() + CACHE_TTL_MS,
            });
          }

          const choices = [
            {
              name: `all (remove all ${registeredCommands.length} commands)`,
              value: "all",
            },
            ...registeredCommands.map((cmd) => ({
              name: cmd.name,
              value: cmd.name,
            })),
          ]
            .filter(
              (c) =>
                c.value === "all" ||
                c.name.toLowerCase().includes(query),
            )
            .slice(0, 25);

          return createAutocompleteResponse(choices);
        } catch {
          return createAutocompleteResponse([
            { name: "Failed to fetch commands", value: "_error" },
          ]);
        }
      }
    }

    return createAutocompleteResponse([]);
  },
});
