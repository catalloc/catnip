/**
 * About Command - Bot info with embed response
 *
 * File: discord/interactions/commands/about.ts
 */

import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "about",
  description: "Show information about this bot",

  registration: { type: "guild" },

  deferred: false,
  ephemeral: false,

  async execute() {
    // Lazy import — registry.ts cannot be statically imported from
    // command files since they are dynamically imported by registry.ts
    const { getAllCommands } = await import("../registry.ts");
    const commands = getAllCommands();

    return {
      success: true,
      message: "",
      embed: {
        title: "About This Bot",
        description: "A Discord bot running on [Val Town](https://val.town).",
        color: 0x5865f2,
        fields: [
          {
            name: "Commands",
            value: `${commands.length} registered`,
            inline: true,
          },
          {
            name: "Runtime",
            value: "Deno (Val Town)",
            inline: true,
          },
        ],
        footer: { text: "Built with vt-discord-bot" },
      },
    };
  },
});
