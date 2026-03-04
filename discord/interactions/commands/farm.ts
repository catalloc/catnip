/**
 * Farm Command — Plant crops, wait, and harvest for coins + XP
 *
 * File: discord/interactions/commands/farm.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { FARM_TIERS } from "../../economy/idle-actions.ts";
import { buildIdleExecutor } from "../../economy/idle-command-helper.ts";

const execute = buildIdleExecutor("farm", FARM_TIERS, "farmEnabled");

export default defineCommand({
  name: "farm",
  description: "Plant crops and harvest them for coins and XP",

  options: [
    {
      name: "start",
      description: "Plant a crop",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "type",
          description: "Crop to plant",
          type: OptionTypes.STRING,
          required: true,
          choices: FARM_TIERS.map((t) => ({ name: t.name, value: t.id })),
        },
      ],
    },
    {
      name: "harvest",
      description: "Harvest your crop",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "status",
      description: "Check on your crop",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "info",
      description: "View all crop tiers",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  execute,
});
