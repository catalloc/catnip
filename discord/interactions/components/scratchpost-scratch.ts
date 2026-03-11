/**
 * Scratchpost Scratch Button Handler
 *
 * Increments the scratchpost counter and updates the embed in-place.
 *
 * File: discord/interactions/components/scratchpost-scratch.ts
 */

import { defineComponent } from "../define-component.ts";
import { kv } from "../../persistence/kv.ts";
import {
  scratchpostKey,
  buildScratchpostEmbed,
  buildScratchpostComponents,
} from "../commands/scratchpost.ts";

export default defineComponent({
  customId: "scratchpost-scratch",
  match: "exact",
  type: "button",

  async execute({ guildId, userId }) {
    const next = await kv.update<number>(
      scratchpostKey(guildId),
      (current) => (current ?? 0) + 1,
    );

    return {
      success: true,
      message: `<@${userId}> scratched the post!`,
      updateMessage: true,
      embed: buildScratchpostEmbed(next),
      components: buildScratchpostComponents(),
    };
  },
});
