/**
 * Forage Command — Forage items, wait, and collect for coins + XP
 *
 * File: discord/interactions/commands/forage.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { FORAGE_TIERS } from "../../economy/idle-actions.ts";
import { buildIdleExecutor } from "../../economy/idle-command-helper.ts";

const execute = buildIdleExecutor("forage", FORAGE_TIERS, "forageEnabled");

export default defineCommand({
  name: "forage",
  description: "Forage for items and collect them for coins and XP",

  options: [
    {
      name: "start",
      description: "Start foraging for an item",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "type",
          description: "Item to forage",
          type: OptionTypes.STRING,
          required: true,
          choices: FORAGE_TIERS.map((t) => ({ name: t.name, value: t.id })),
        },
      ],
    },
    {
      name: "harvest",
      description: "Collect your foraged item",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "status",
      description: "Check on your foraging session",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "info",
      description: "View all forage tiers",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  execute,
});
