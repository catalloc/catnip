/**
 * Scratchpost Command - Summons the scratchpost embed with a scratch button
 *
 * File: discord/interactions/commands/scratchpost.ts
 */

import { defineCommand } from "../define-command.ts";
import { kv } from "../../persistence/kv.ts";

export function scratchpostKey(guildId: string): string {
  return `scratchpost:${guildId}`;
}

export function buildScratchpostEmbed(count: number) {
  return {
    title: "🐱 Scratchpost",
    description: `The scratchpost has been scratched **${count}** time${count === 1 ? "" : "s"}.`,
    color: 0xf5a623,
  };
}

export function buildScratchpostComponents() {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: "Scratch",
          emoji: { name: "🐾" },
          custom_id: "scratchpost-scratch",
        },
      ],
    },
  ];
}

export default defineCommand({
  name: "scratchpost",
  description: "Summon the scratchpost",

  options: [],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  async execute({ guildId }) {
    const count = (await kv.get<number>(scratchpostKey(guildId))) ?? 0;

    return {
      success: true,
      embed: buildScratchpostEmbed(count),
      components: buildScratchpostComponents(),
    };
  },
});
