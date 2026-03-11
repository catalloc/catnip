/**
 * Facts Page Handler
 *
 * Handles pagination button clicks for /facts.
 * File: discord/interactions/components/facts-page.ts
 */

import { defineComponent } from "../define-component.ts";
import { buildFactPage } from "../commands/facts.ts";

export default defineComponent({
  customId: "facts-page:",
  match: "prefix",
  type: "button",

  async execute({ customId }) {
    const page = parseInt(customId.split(":")[1], 10) || 0;
    const { embed, components } = buildFactPage(page);
    return { success: true, updateMessage: true, message: "", embed, components };
  },
});
