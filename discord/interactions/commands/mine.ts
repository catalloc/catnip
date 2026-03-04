/**
 * Mine Command — Mine ores, wait, and collect for coins + XP
 *
 * File: discord/interactions/commands/mine.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { MINE_TIERS } from "../../economy/idle-actions.ts";
import { buildIdleExecutor } from "../../economy/idle-command-helper.ts";

const execute = buildIdleExecutor("mine", MINE_TIERS, "mineEnabled");

export default defineCommand({
  name: "mine",
  description: "Mine ores and collect them for coins and XP",

  options: [
    {
      name: "start",
      description: "Start mining an ore",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "type",
          description: "Ore to mine",
          type: OptionTypes.STRING,
          required: true,
          choices: MINE_TIERS.map((t) => ({ name: t.name, value: t.id })),
        },
      ],
    },
    {
      name: "harvest",
      description: "Collect your mined ore",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "status",
      description: "Check on your mining session",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "info",
      description: "View all ore tiers",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  execute,
});
