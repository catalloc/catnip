/**
 * Commands - Admin command for registering/unregistering slash commands
 *
 * Subcommands:
 *   /commands register [command] [server]
 *   /commands unregister [server] [command]
 *
 * File: discord/interactions/commands/commands.ts
 */

import {
  defineCommand,
  OptionTypes,
  SERVERS,
  SERVER_KEYS,
  parseServerKey,
  type ServerKey,
} from "../define-command.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import { ADMIN_ROLE_ID, CONFIG } from "../../constants.ts";

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

/** Format a server key from a guild ID, falling back to a truncated ID */
function serverLabel(guildId: string | undefined): string {
  if (!guildId) return "global";
  return (
    Object.entries(SERVERS).find(([, id]) => id === guildId)?.[0] ??
    guildId.slice(0, 12)
  );
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
      message += `- \`${r.command}\` -> ${serverLabel(r.guildId)}\n`;
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

function autocompleteServerChoices(query: string) {
  return [
    { name: "Use Registry Defaults", value: "configured" },
    ...SERVER_KEYS.map((key) => ({ name: key, value: key.toLowerCase() })),
  ].filter(
    (c) => c.name.toLowerCase().includes(query) || c.value.includes(query),
  );
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
      description: "Register slash commands to Discord servers",
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
        {
          name: "server",
          description: "Target server (leave empty for registry defaults)",
          type: OptionTypes.STRING,
          required: false,
          autocomplete: true,
        },
      ],
    },
    {
      name: "unregister",
      description: "Unregister slash commands from Discord servers",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "server",
          description: "Target server to unregister from",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
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

  registration: { type: "guild", servers: ["MAIN"] },

  permissions: {
    users: [CONFIG.appOwnerId],
    roles: [ADMIN_ROLE_ID],
  },

  async execute({ options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "register") {
      const commandOption = options?.command as string;
      const serverOption = options?.server as string | undefined;

      if (!commandOption) {
        return { success: false, error: "No command specified." };
      }

      try {
        let results;
        let summary: string;

        const reg = await getRegistration();

        if (commandOption === "all") {
          if (serverOption && serverOption !== "configured") {
            const serverKey = parseServerKey(serverOption);
            if (!serverKey) return { success: false, error: `Unknown server: ${serverOption}` };
            results = await reg.registerCommandsToServer(serverKey);
            summary = `Registered ${results.filter((r) => r.success).length} commands to **${serverKey}**`;
          } else {
            results = await reg.registerAllCommandsFromRegistry();
            summary = `Registered all commands to their configured servers`;
          }
        } else {
          const names = await registerableNames();
          if (!names.includes(commandOption)) {
            return { success: false, error: `Unknown command: ${commandOption}` };
          }

          if (serverOption && serverOption !== "configured") {
            const serverKey = parseServerKey(serverOption);
            if (!serverKey) return { success: false, error: `Unknown server: ${serverOption}` };
            results = await reg.registerCommandsToServer(serverKey, [commandOption]);
            summary = `Registered **/${commandOption}** to **${serverKey}**`;
          } else {
            results = await reg.registerCommand(commandOption);
            summary = `Registered **/${commandOption}** to configured servers`;
          }
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
      const serverOption = (options?.server as string)?.toUpperCase();
      const commandOption = options?.command as string;

      const serverKey = serverOption ? parseServerKey(serverOption) : null;
      if (!serverKey) {
        return {
          success: false,
          error: `Invalid server. Valid options: ${SERVER_KEYS.join(", ")}`,
        };
      }

      if (!commandOption) {
        return { success: false, error: "No command specified." };
      }

      const reg = await getRegistration();

      if (commandOption === "all") {
        const result = await reg.deregisterAllFromServer(serverKey);
        return result.success
          ? { success: true, message: `Removed all commands from ${serverKey}` }
          : { success: false, error: result.error || "Failed to deregister commands" };
      }

      const result = await reg.deregisterCommandFromServer(commandOption, serverKey);
      return result.success
        ? { success: true, message: `Unregistered \`${commandOption}\` from ${serverKey}` }
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
      if (focusedOption.name === "server") {
        return createAutocompleteResponse(autocompleteServerChoices(query));
      }
    }

    if (subName === "unregister") {
      if (focusedOption.name === "server") {
        const choices = SERVER_KEYS.filter((key) =>
          key.toLowerCase().includes(query),
        ).map((key) => ({ name: key, value: key.toLowerCase() }));
        return createAutocompleteResponse(choices);
      }

      if (focusedOption.name === "command") {
        const serverOpt = subOption.options?.find(
          (o: any) => o.name === "server",
        );
        const serverKey = serverOpt?.value?.toUpperCase() as ServerKey | undefined;

        if (!serverKey || !SERVER_KEYS.includes(serverKey)) {
          return createAutocompleteResponse([
            { name: "Select a server first", value: "_invalid" },
          ]);
        }

        try {
          const guildId = SERVERS[serverKey];
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
            { name: `Failed to fetch from ${serverKey}`, value: "_error" },
          ]);
        }
      }
    }

    return createAutocompleteResponse([]);
  },
});
