/**
 * Ticket Creation Modal Handler
 *
 * Processes the modal from /ticket new. Creates a private channel,
 * posts the user's message, and sends a staff control panel.
 *
 * File: discord/interactions/components/ticket-modal.ts
 */

import { defineComponent } from "../define-component.ts";
import { CONFIG, EmbedColors } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import { discordBotFetch } from "../../discord-api.ts";
import {
  type TicketData,
  ticketKey,
  claimTicketSlot,
  releaseTicketSlot,
  buildStaffEmbed,
  buildStaffComponents,
  MAX_OPEN_TICKETS,
} from "../commands/ticket.ts";
import { createLogger } from "../../webhook/logger.ts";

const logger = createLogger("TicketModal");

export default defineComponent({
  customId: "ticket-modal:",
  match: "prefix",
  type: "modal",

  async execute({ customId, guildId, userId, fields }) {
    const title = (fields?.ticket_title ?? "Untitled").slice(0, 256);
    const description = (fields?.ticket_description ?? "No description").slice(0, 4096);

    // Re-check config (race guard)
    const config = await guildConfig.getTicketConfig(guildId);
    if (!config.staffChannelId || !config.categoryId) {
      return { success: false, error: "Ticket system is not configured." };
    }

    // Atomically claim a ticket slot (combined limit check + increment)
    const slotClaimed = await claimTicketSlot(guildId, userId);
    if (!slotClaimed) {
      return { success: false, error: `You already have ${MAX_OPEN_TICKETS} open tickets.` };
    }

    // Atomic counter for ticket number
    const ticketNumber = await kv.update<number>(
      `ticket-counter:${guildId}`,
      (n) => (n ?? 0) + 1,
    );

    // Create private channel under the configured category
    const channelName = `ticket-${ticketNumber}`;
    const createResult = await discordBotFetch("POST", `guilds/${guildId}/channels`, {
      name: channelName,
      type: 0, // GUILD_TEXT
      parent_id: config.categoryId,
      permission_overwrites: [
        {
          id: guildId, // @everyone role (same ID as guildId)
          type: 0, // role
          deny: "1024", // VIEW_CHANNEL
        },
        {
          id: userId,
          type: 1, // member
          allow: "3072", // VIEW_CHANNEL | SEND_MESSAGES
        },
        {
          id: CONFIG.appId,
          type: 1, // member
          allow: "3072", // VIEW_CHANNEL | SEND_MESSAGES
        },
      ],
    });

    if (!createResult.ok) {
      logger.warn(`Failed to create ticket channel for guild ${guildId}: ${createResult.error}`);
      await releaseTicketSlot(guildId, userId);
      return { success: false, error: "Failed to create ticket channel. The bot may lack Manage Channels permission." };
    }

    const channelId = createResult.data.id;

    // Post user's message in the ticket channel
    const userEmbed = {
      title,
      description,
      color: EmbedColors.INFO,
      footer: { text: `Ticket #${ticketNumber} — Created by ${userId}` },
      timestamp: new Date().toISOString(),
    };
    const openingMsgResult = await discordBotFetch("POST", `channels/${channelId}/messages`, {
      content: `<@${userId}> — your ticket has been created. Staff will be with you shortly.`,
      embeds: [userEmbed],
    });
    if (!openingMsgResult.ok) {
      logger.warn(`Failed to post opening message in ticket ${channelId}: ${openingMsgResult.error}`);
    }

    // Build ticket data (staffMessageId filled after posting)
    const now = Date.now();
    const ticket: TicketData = {
      guildId,
      channelId,
      userId,
      title,
      staffMessageId: "",
      staffChannelId: config.staffChannelId,
      joinedStaff: [],
      status: "open",
      createdAt: now,
    };

    // Post staff control embed in staff channel
    const staffPost = await discordBotFetch("POST", `channels/${config.staffChannelId}/messages`, {
      embeds: [buildStaffEmbed(ticket)],
      components: buildStaffComponents(guildId, channelId),
    });

    if (staffPost.ok) {
      ticket.staffMessageId = staffPost.data.id;
    }

    // Store ticket in KV (no due_at while open)
    try {
      await kv.set(ticketKey(guildId, channelId), ticket);
    } catch (err) {
      // KV write failed — clean up the orphaned Discord channel + release slot
      logger.error(`Failed to store ticket in KV for channel ${channelId}:`, err);
      await discordBotFetch("DELETE", `channels/${channelId}`).catch(() => {});
      await releaseTicketSlot(guildId, userId);
      return { success: false, error: "Failed to create ticket. Please try again." };
    }

    return {
      success: true,
      message: `Ticket created! Head to <#${channelId}>.`,
    };
  },
});
