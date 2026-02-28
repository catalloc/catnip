/**
 * Facts Command - Browse fun facts with pagination buttons
 *
 * File: discord/interactions/commands/facts.ts
 */

import { defineCommand } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";

export const FACTS = [
  "Honey never spoils \u2014 archaeologists found 3,000-year-old honey still edible.",
  "Octopuses have three hearts and blue blood.",
  "A day on Venus is longer than its year.",
  "Bananas are berries, but strawberries aren't.",
  "The Eiffel Tower can grow up to 6 inches taller in summer.",
  "Sharks existed before trees.",
  "Cleopatra lived closer to the Moon landing than to the building of the Great Pyramid.",
  "There are more possible chess games than atoms in the observable universe.",
];

export function buildFactPage(page: number) {
  const total = FACTS.length;
  const idx = ((page % total) + total) % total;
  return {
    embed: {
      title: `Fact ${idx + 1} of ${total}`,
      description: FACTS[idx],
      color: EmbedColors.INFO,
    },
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: "Previous",
            custom_id: `facts-page:${idx - 1}`,
          },
          {
            type: 2,
            style: 1,
            label: "Next",
            custom_id: `facts-page:${idx + 1}`,
          },
        ],
      },
    ],
  };
}

export default defineCommand({
  name: "facts",
  description: "Browse fun facts with pagination buttons",

  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  ephemeral: false,

  async execute() {
    const { embed, components } = buildFactPage(0);
    return { success: true, message: "", embed, components };
  },
});
