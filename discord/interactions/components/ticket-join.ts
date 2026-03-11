/**
 * Ticket Join Button Handler
 *
 * Adds a staff member to a ticket channel and updates the staff embed.
 *
 * File: discord/interactions/components/ticket-join.ts
 */

import { defineComponent } from "../define-component.ts";
import { kv } from "../../persistence/kv.ts";
import { discordBotFetch } from "../../discord-api.ts";
import {
  type TicketData,
  ticketKey,
  buildStaffEmbed,
  buildStaffComponents,
} from "../commands/ticket.ts";
import { createLogger } from "../../webhook/logger.ts";

const logger = createLogger("TicketJoin");

export default defineComponent({
  customId: "ticket-join:",
  match: "prefix",
  type: "button",
  adminOnly: true,

  async execute({ customId, guildId: ctxGuildId, userId }) {
    // Parse "ticket-join:{guildId}:{channelId}"
    const parts = customId.split(":");
    const guildId = parts[1];
    const channelId = parts[2];

    if (!guildId || !channelId || guildId !== ctxGuildId) {
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
    if (ticket.joinedStaff.includes(userId)) {
      return { success: false, error: "You've already joined this ticket." };
    }

    // Update KV first
    const updated = await kv.update<TicketData>(key, (current) => {
      if (!current || current.status !== "open") return current!;
      if (!current.joinedStaff.includes(userId)) {
        current.joinedStaff.push(userId);
      }
      return current;
    });

    // Add permission overwrite for the staff member
    const permResult = await discordBotFetch(
      "PUT",
      `channels/${channelId}/permissions/${userId}`,
      { id: userId, type: 1, allow: "3072" }, // VIEW_CHANNEL | SEND_MESSAGES
    );
    if (!permResult.ok) {
      // Rollback KV — remove userId from joinedStaff
      try {
        await kv.update<TicketData>(key, (current) => {
          if (!current) return current!;
          current.joinedStaff = current.joinedStaff.filter((id) => id !== userId);
          return current;
        });
      } catch (rollbackErr) {
        logger.warn(`Failed to rollback joinedStaff for ${userId} in ticket ${channelId}: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`);
      }
      return { success: false, error: "Failed to add you to the ticket channel." };
    }

    // Post join notice in ticket channel
    await discordBotFetch("POST", `channels/${channelId}/messages`, {
      content: `<@${userId}> has joined the ticket.`,
    });

    // Return updated staff embed
    return {
      success: true,
      message: "",
      updateMessage: true,
      embed: buildStaffEmbed(updated),
      components: buildStaffComponents(guildId, channelId),
    };
  },
});
