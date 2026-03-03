/**
 * Ticket Support System
 *
 * Subcommands:
 *   /ticket new — Open a new support ticket (shows modal)
 *   /ticket close [reason] — Close the current ticket channel
 *   /ticket setup <staff-channel> <category> — Configure ticket system (admin)
 *
 * File: discord/interactions/commands/ticket.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { CONFIG, EmbedColors, isGuildAdmin } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { guildConfig } from "../../persistence/guild-config.ts";
import { discordBotFetch } from "../../discord-api.ts";
import { createLogger } from "../../webhook/logger.ts";

const logger = createLogger("Ticket");

export const KV_PREFIX = "ticket:";
export const DELETE_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_OPEN_TICKETS = 3;

function slotKey(guildId: string, userId: string): string {
  return `ticket-slots:${guildId}:${userId}`;
}

/**
 * Atomically claim a ticket creation slot.
 * Returns true if under the limit (slot reserved), false if at/over the limit.
 *
 * On first use (counter not yet initialized), seeds from actual ticket count.
 * On limit hit, falls back to countOpenTickets to recover from counter drift.
 */
export async function claimTicketSlot(guildId: string, userId: string): Promise<boolean> {
  const key = slotKey(guildId, userId);

  // Seed counter from actual count on first use
  const existing = await kv.get<number>(key);
  if (existing === null) {
    const actualCount = await countOpenTickets(guildId, userId);
    await kv.set(key, actualCount);
  }

  // Atomically check limit + increment
  let limitHit = false;
  await kv.update<number>(key, (current) => {
    const count = current ?? 0;
    if (count >= MAX_OPEN_TICKETS) {
      limitHit = true;
      return count;
    }
    return count + 1;
  });

  if (!limitHit) return true;

  // Counter says limit — verify with actual scan to recover from drift
  const actualCount = await countOpenTickets(guildId, userId);
  if (actualCount >= MAX_OPEN_TICKETS) return false;

  // Counter was stale — reset to actual + 1 (claim the slot)
  await kv.set(key, actualCount + 1);
  return true;
}

/** Release a ticket slot (e.g., on creation failure or ticket close). */
export async function releaseTicketSlot(guildId: string, userId: string): Promise<void> {
  try {
    await kv.update<number>(slotKey(guildId, userId), (current) =>
      Math.max((current ?? 1) - 1, 0),
    );
  } catch {
    // Non-critical — counter drift is self-healing via claimTicketSlot fallback
  }
}

export interface TicketData {
  guildId: string;
  channelId: string;
  userId: string;
  title: string;
  staffMessageId: string;
  staffChannelId: string;
  joinedStaff: string[];
  status: "open" | "closed";
  closedBy?: string;
  closeReason?: string;
  createdAt: number;
}

export function ticketKey(guildId: string, channelId: string): string {
  return `${KV_PREFIX}${guildId}:${channelId}`;
}

export function ticketPrefix(guildId: string): string {
  return `${KV_PREFIX}${guildId}:`;
}

export async function countOpenTickets(guildId: string, userId: string): Promise<number> {
  const entries = await kv.list(ticketPrefix(guildId), 500);
  let count = 0;
  for (const entry of entries) {
    const ticket = entry.value as TicketData;
    if (ticket.userId === userId && ticket.status === "open") {
      count++;
    }
  }
  return count;
}

export function buildStaffEmbed(ticket: TicketData) {
  const isClosed = ticket.status === "closed";
  const fields = [
    { name: "Created By", value: `<@${ticket.userId}>`, inline: true },
    { name: "Channel", value: isClosed ? `#closed-${ticket.channelId.slice(-4)}` : `<#${ticket.channelId}>`, inline: true },
    { name: "Status", value: isClosed ? "Closed" : "Open", inline: true },
  ];

  if (ticket.joinedStaff.length > 0) {
    fields.push({ name: "Staff", value: ticket.joinedStaff.map((id) => `<@${id}>`).join(", "), inline: false });
  }
  if (isClosed && ticket.closedBy) {
    fields.push({ name: "Closed By", value: `<@${ticket.closedBy}>`, inline: true });
  }
  if (isClosed && ticket.closeReason) {
    fields.push({ name: "Reason", value: ticket.closeReason, inline: false });
  }

  return {
    title: isClosed ? `Ticket Closed — ${ticket.title}` : `Ticket — ${ticket.title}`,
    color: isClosed ? EmbedColors.ERROR : EmbedColors.INFO,
    fields,
    footer: { text: `Ticket channel: ${ticket.channelId}` },
    timestamp: new Date(ticket.createdAt).toISOString(),
  };
}

export function buildStaffComponents(guildId: string, channelId: string, closed = false) {
  if (closed) return [];
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1, // PRIMARY
          label: "Join Ticket",
          custom_id: `ticket-join:${guildId}:${channelId}`,
        },
        {
          type: 2,
          style: 4, // DANGER
          label: "Close Ticket",
          custom_id: `ticket-close:${guildId}:${channelId}`,
        },
      ],
    },
  ];
}

export async function closeTicket(
  guildId: string,
  channelId: string,
  closedBy: string,
  reason?: string,
): Promise<TicketData | null> {
  const key = ticketKey(guildId, channelId);

  const ticket = await kv.claimUpdate<TicketData>(key, (current) => {
    if (current.status === "closed") return null;
    return {
      ...current,
      status: "closed" as const,
      closedBy,
      closeReason: reason || undefined,
    };
  });

  if (!ticket) return null;

  // Release the ticket slot for this user
  await releaseTicketSlot(guildId, ticket.userId);

  // Set due_at for auto-deletion
  await kv.set(key, ticket, Date.now() + DELETE_DELAY_MS);

  // Lock channel — deny SEND_MESSAGES for @everyone
  const lockResult = await discordBotFetch(
    "PUT",
    `channels/${channelId}/permissions/${guildId}`,
    { id: guildId, type: 0, deny: "2048" }, // SEND_MESSAGES
  );
  if (!lockResult.ok) {
    logger.error(`Failed to lock ticket channel ${channelId}: ${lockResult.error}`);
  }

  // Rename channel
  const shortId = channelId.slice(-4);
  const renameResult = await discordBotFetch("PATCH", `channels/${channelId}`, {
    name: `closed-${shortId}`,
  });
  if (!renameResult.ok) {
    logger.warn(`Failed to rename ticket channel ${channelId}: ${renameResult.error}`);
  }

  // Post close notice in ticket channel
  const closeEmbed = {
    title: "Ticket Closed",
    description: [
      `Closed by <@${closedBy}>`,
      reason ? `**Reason:** ${reason}` : "",
      "",
      "This channel will be deleted in 24 hours.",
    ].filter(Boolean).join("\n"),
    color: EmbedColors.ERROR,
    timestamp: new Date().toISOString(),
  };
  const closeNoticeResult = await discordBotFetch("POST", `channels/${channelId}/messages`, {
    embeds: [closeEmbed],
  });
  if (!closeNoticeResult.ok) {
    logger.warn(`Failed to post close notice in ticket ${channelId}: ${closeNoticeResult.error}`);
  }

  // Update staff embed
  const patchResult = await discordBotFetch(
    "PATCH",
    `channels/${ticket.staffChannelId}/messages/${ticket.staffMessageId}`,
    {
      embeds: [buildStaffEmbed(ticket)],
      components: buildStaffComponents(guildId, channelId, true),
    },
  );
  if (!patchResult.ok) {
    logger.error(`Failed to update staff embed for ticket ${channelId}: ${patchResult.error}`);
  }

  return ticket;
}

export default defineCommand({
  name: "ticket",
  description: "Support ticket system",

  options: [
    {
      name: "new",
      description: "Open a new support ticket",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "close",
      description: "Close the current ticket",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "reason",
          description: "Reason for closing",
          type: OptionTypes.STRING,
          required: false,
          max_length: 500,
        },
      ],
    },
    {
      name: "setup",
      description: "Configure ticket system (admin only)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "staff-channel",
          description: "Channel for staff ticket controls",
          type: OptionTypes.CHANNEL,
          required: true,
        },
        {
          name: "category",
          description: "Category to create ticket channels under",
          type: OptionTypes.CHANNEL,
          required: true,
        },
      ],
    },
  ],

  registration: { type: "guild" },
  deferred: false,

  async execute({ guildId, userId, options, memberRoles, memberPermissions }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "new") {
      // Check config exists
      const config = await guildConfig.getTicketConfig(guildId);
      if (!config.staffChannelId || !config.categoryId) {
        return { success: false, error: "Ticket system is not configured. Ask an admin to run `/ticket setup`." };
      }

      // Check ticket limit
      const openCount = await countOpenTickets(guildId, userId);
      if (openCount >= MAX_OPEN_TICKETS) {
        return { success: false, error: `You already have ${openCount} open ticket(s). Maximum is ${MAX_OPEN_TICKETS}.` };
      }

      return {
        success: true,
        modal: {
          title: "New Support Ticket",
          custom_id: `ticket-modal:${guildId}`,
          components: [
            {
              type: 1,
              components: [{
                type: 4,
                custom_id: "ticket_title",
                label: "Title",
                style: 1,
                placeholder: "Brief summary of your issue",
                required: true,
                max_length: 100,
              }],
            },
            {
              type: 1,
              components: [{
                type: 4,
                custom_id: "ticket_description",
                label: "Description",
                style: 2,
                placeholder: "Describe your issue in detail...",
                required: true,
                max_length: 1000,
              }],
            },
          ],
        },
      };
    }

    if (sub === "close") {
      const channelId = options.channelId as string;
      const reason = options.reason as string | undefined;

      // Look up ticket by current channel
      const key = ticketKey(guildId, channelId);
      const ticket = await kv.get<TicketData>(key);
      if (!ticket) {
        return { success: false, error: "This channel is not a ticket." };
      }
      if (ticket.status === "closed") {
        return { success: false, error: "This ticket is already closed." };
      }

      const closed = await closeTicket(guildId, channelId, userId, reason);
      if (!closed) {
        return { success: false, error: "Failed to close ticket — it may already be closed." };
      }

      return { success: true, message: "Ticket closed." };
    }

    if (sub === "setup") {
      // Inline admin check
      const authorized = await isGuildAdmin(guildId, userId, memberRoles ?? [], memberPermissions);
      if (!authorized) {
        return { success: false, error: "You need admin permissions to configure tickets." };
      }

      const staffChannelId = options["staff-channel"] as string;
      const categoryId = options.category as string;

      await guildConfig.setTicketConfig(guildId, staffChannelId, categoryId);

      return {
        success: true,
        message: `Ticket system configured!\n**Staff channel:** <#${staffChannelId}>\n**Category:** <#${categoryId}>`,
      };
    }

    return { success: false, error: "Please use a subcommand: new, close, or setup." };
  },
});
