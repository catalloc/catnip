/**
 * Ticket Close Button Handler
 *
 * Opens a modal for the close reason when staff clicks "Close Ticket".
 *
 * File: discord/interactions/components/ticket-close.ts
 */

import { defineComponent } from "../define-component.ts";
import { kv } from "../../persistence/kv.ts";
import { type TicketData, ticketKey } from "../commands/ticket.ts";

export default defineComponent({
  customId: "ticket-close:",
  match: "prefix",
  type: "button",

  async execute({ customId }) {
    // Parse "ticket-close:{guildId}:{channelId}"
    const parts = customId.split(":");
    const guildId = parts[1];
    const channelId = parts[2];

    if (!guildId || !channelId) {
      return { success: false, error: "Invalid ticket reference." };
    }

    const key = ticketKey(guildId, channelId);
    const ticket = await kv.get<TicketData>(key);

    if (!ticket) {
      return { success: false, error: "Ticket not found." };
    }
    if (ticket.status !== "open") {
      return { success: false, error: "This ticket is already closed." };
    }

    return {
      success: true,
      message: "",
      modal: {
        title: "Close Ticket",
        custom_id: `ticket-close-modal:${guildId}:${channelId}`,
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: "close_reason",
              label: "Reason (optional)",
              style: 2, // paragraph
              placeholder: "Why is this ticket being closed?",
              required: false,
              max_length: 500,
            }],
          },
        ],
      },
    };
  },
});
