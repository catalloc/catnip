/**
 * Help Command - Lists all non-admin commands
 *
 * File: discord/interactions/commands/help.ts
 */

import { defineCommand } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "help",
  description: "List available commands",

  registration: {
    type: "guild",
    servers: ["MAIN"],
  },

  deferred: false,

  async execute() {
    // Lazy import — registry.ts cannot be statically imported from
    // command files since they are dynamically imported by registry.ts
    const { getAllCommands } = await import("../registry.ts");
    const commands = getAllCommands()
      .filter((cmd) => !cmd.permissions)
      .sort((a, b) => a.name.localeCompare(b.name));

    const lines = commands.map(
      (cmd) => `**/${cmd.name}** — ${cmd.description}`
    );

    return {
      success: true,
      message: "",
      embed: {
        title: "Available Commands",
        description: lines.join("\n") || "No commands available.",
        color: EmbedColors.INFO,
      },
    };
  },
});
