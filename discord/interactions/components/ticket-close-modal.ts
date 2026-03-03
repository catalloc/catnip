/**
 * Ticket Close Modal Handler
 *
 * Processes the close reason modal and closes the ticket.
 *
 * File: discord/interactions/components/ticket-close-modal.ts
 */

import { defineComponent } from "../define-component.ts";
import { closeTicket } from "../commands/ticket.ts";

export default defineComponent({
  customId: "ticket-close-modal:",
  match: "prefix",
  type: "modal",

  async execute({ customId, userId, fields }) {
    // Parse "ticket-close-modal:{guildId}:{channelId}"
    const parts = customId.split(":");
    const guildId = parts[1];
    const channelId = parts[2];

    if (!guildId || !channelId) {
      return { success: false, error: "Invalid ticket reference." };
    }

    const reason = fields?.close_reason?.trim() || undefined;

    const closed = await closeTicket(guildId, channelId, userId, reason);
    if (!closed) {
      return { success: false, error: "Failed to close ticket — it may already be closed." };
    }

    return { success: true, message: "Ticket closed successfully." };
  },
});
