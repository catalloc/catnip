/**
 * Paste - Server pastebin stored in blob storage
 *
 * Subcommands:
 *   /paste create <content>              — Store text, get a short code
 *   /paste get <code> [public]           — Retrieve and display a paste (role/user-gated)
 *   /paste list                          — Show all pastes for this guild
 *   /paste delete <code>                 — Remove a paste (creator or admin)
 *   /paste allow-role <code> <role>      — Grant role view permission (admin)
 *   /paste deny-role <code> <role>       — Revoke role view permission (admin)
 *   /paste allow-user <code> <user>      — Grant user view permission (admin)
 *   /paste deny-user <code> <user>       — Revoke user view permission (admin)
 *
 * File: discord/interactions/commands/paste.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors, isGuildAdmin } from "../../constants.ts";
import { blob } from "../../persistence/blob.ts";
import { createAutocompleteResponse } from "../patterns.ts";

export interface PasteEntry {
  content: string;
  allowedRoles?: string[];
  allowedUsers?: string[];
  createdBy: string;
  createdAt: string;
  title?: string;
}

const MAX_PASTES = 50;
const MAX_PASTES_PER_USER = 15;
const MAX_CONTENT_LENGTH = 6000;
const AUTOCOMPLETE_CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;

function blobKey(guildId: string, code: string): string {
  return `paste:${guildId}:${code}`;
}

function blobPrefix(guildId: string): string {
  return `paste:${guildId}:`;
}

/** Validate paste code: hex only, max 16 chars. Returns null if invalid. */
function sanitizeCode(raw: string): string | null {
  const code = raw.trim().toLowerCase();
  return /^[a-f0-9]{1,16}$/.test(code) ? code : null;
}

/** Generate an 8-char hex ID. */
function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface PasteListItem {
  code: string;
  entry: PasteEntry;
}

async function listPastes(guildId: string): Promise<PasteListItem[]> {
  const prefix = blobPrefix(guildId);
  const entries = await blob.list(prefix);
  const items: PasteListItem[] = [];
  for (const e of entries) {
    const code = e.key.slice(prefix.length);
    const entry = await blob.getJSON<PasteEntry>(e.key);
    if (entry) items.push({ code, entry });
  }
  return items;
}

const listCache = new Map<string, { items: PasteListItem[]; expiresAt: number }>();

async function listPastesCached(guildId: string): Promise<PasteListItem[]> {
  const cacheKey = blobPrefix(guildId);
  const cached = listCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.items;
  const items = await listPastes(guildId);
  if (listCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = listCache.keys().next().value;
    if (oldest !== undefined) listCache.delete(oldest);
  }
  listCache.set(cacheKey, { items, expiresAt: Date.now() + AUTOCOMPLETE_CACHE_TTL_MS });
  return items;
}

function invalidateCache(guildId: string): void {
  listCache.delete(blobPrefix(guildId));
}

/** Check if user has permission to get a paste. Unrestricted when both lists are empty/missing. */
async function canGet(
  entry: PasteEntry,
  guildId: string,
  userId: string,
  memberRoles: string[],
  memberPermissions?: string,
): Promise<boolean> {
  if (await isGuildAdmin(guildId, userId, memberRoles, memberPermissions)) return true;
  if (entry.allowedUsers?.includes(userId)) return true;
  if (entry.allowedRoles?.length) {
    return memberRoles.some((r) => entry.allowedRoles!.includes(r));
  }
  // No restrictions — open by default
  if (!entry.allowedUsers?.length && !entry.allowedRoles?.length) return true;
  return false;
}

export const _internals = { blobKey, blobPrefix, generateCode, sanitizeCode, canGet };

export default defineCommand({
  name: "paste",
  description: "Server pastebin — store and share text snippets",

  options: [
    {
      name: "create",
      description: "Store text and get a short code",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "content",
          description: "Text to store",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
          max_length: MAX_CONTENT_LENGTH,
        },
      ],
    },
    {
      name: "get",
      description: "Retrieve and display a paste",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "code",
          description: "Paste code",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "public",
          description: "Show the paste to the whole channel (default: false)",
          type: OptionTypes.BOOLEAN,
          required: false,
        },
      ],
    },
    {
      name: "list",
      description: "Show all pastes for this server",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "delete",
      description: "Remove a paste (creator or admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "code",
          description: "Paste code",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "allow-role",
      description: "Grant a role permission to view this paste (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "code",
          description: "Paste code",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "role",
          description: "Role to allow",
          type: OptionTypes.ROLE,
          required: true,
        },
      ],
    },
    {
      name: "deny-role",
      description: "Revoke a role's view permission (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "code",
          description: "Paste code",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "role",
          description: "Role to deny",
          type: OptionTypes.ROLE,
          required: true,
        },
      ],
    },
    {
      name: "allow-user",
      description: "Grant a user permission to view this paste (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "code",
          description: "Paste code",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "user",
          description: "User to allow",
          type: OptionTypes.USER,
          required: true,
        },
      ],
    },
    {
      name: "deny-user",
      description: "Revoke a user's view permission (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "code",
          description: "Paste code",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "user",
          description: "User to deny",
          type: OptionTypes.USER,
          required: true,
        },
      ],
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,

  autocomplete(body, _config) {
    const guildId = body.guild_id;
    const options = body.data.options?.[0];
    const focused = options?.options?.find((o: any) => o.focused);
    const query = (focused?.value as string || "").toLowerCase();

    return (async () => {
      const items = await listPastesCached(guildId);
      const filtered = query
        ? items.filter((i) => i.code.includes(query) || i.entry.content.toLowerCase().includes(query))
        : items;
      return createAutocompleteResponse(
        filtered.map((i) => {
          const preview = i.entry.content.slice(0, 60).replace(/\n/g, " ");
          return { name: `${i.code} — ${preview}`, value: i.code };
        }),
      );
    })();
  },

  async execute({ guildId, userId, options, memberRoles, memberPermissions }) {
    const sub = options?.subcommand as string | undefined;
    const roles = memberRoles ?? [];

    if (sub === "create") {
      const content = options.content as string;

      // Check limits
      const allPastes = await listPastes(guildId);
      if (allPastes.length >= MAX_PASTES) {
        return { success: false, error: `Maximum of ${MAX_PASTES} pastes reached for this server.` };
      }
      const userCount = allPastes.filter((p) => p.entry.createdBy === userId).length;
      if (userCount >= MAX_PASTES_PER_USER) {
        return { success: false, error: `You've reached the maximum of ${MAX_PASTES_PER_USER} pastes per user.` };
      }

      const code = generateCode();
      const entry: PasteEntry = {
        content,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };

      await blob.setJSON(blobKey(guildId, code), entry);
      invalidateCache(guildId);

      return { success: true, message: `Paste created with code \`${code}\`. Use \`/paste get ${code}\` to retrieve it.` };
    }

    if (sub === "get") {
      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }
      const isPublic = (options.public as boolean) ?? false;
      const entry = await blob.getJSON<PasteEntry>(blobKey(guildId, code));

      if (!entry) {
        return { success: false, error: `Paste \`${code}\` not found.` };
      }

      if (!(await canGet(entry, guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You don't have permission to view this paste." };
      }

      return {
        success: true,
        message: entry.content,
        ephemeral: !isPublic,
      };
    }

    if (sub === "list") {
      const items = await listPastes(guildId);

      if (items.length === 0) {
        return { success: true, message: "No pastes found. Use `/paste create` to create one." };
      }

      const lines = items.map((i) => {
        const preview = i.entry.content.slice(0, 50).replace(/\n/g, " ") +
          (i.entry.content.length > 50 ? "..." : "");
        const parts: string[] = [];
        if (i.entry.allowedRoles?.length) {
          parts.push(`roles: ${i.entry.allowedRoles.map((r) => `<@&${r}>`).join(", ")}`);
        }
        if (i.entry.allowedUsers?.length) {
          parts.push(`users: ${i.entry.allowedUsers.map((u) => `<@${u}>`).join(", ")}`);
        }
        const permInfo = parts.length ? ` (${parts.join("; ")})` : "";
        return `\`${i.code}\` — ${preview}${permInfo}`;
      });

      return {
        success: true,
        message: "",
        embed: {
          title: "Server Pastes",
          description: lines.join("\n"),
          color: EmbedColors.INFO,
          footer: { text: `${items.length}/${MAX_PASTES} pastes` },
        },
      };
    }

    if (sub === "delete") {
      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }
      const entry = await blob.getJSON<PasteEntry>(blobKey(guildId, code));

      if (!entry) {
        return { success: false, error: `Paste \`${code}\` not found.` };
      }

      // Check ownership: creator or admin
      const isAdmin = await isGuildAdmin(guildId, userId, roles, memberPermissions);
      if (entry.createdBy !== userId && !isAdmin) {
        return { success: false, error: "You can only delete your own pastes unless you're an admin." };
      }

      await blob.delete(blobKey(guildId, code));
      invalidateCache(guildId);

      return { success: true, message: `Paste \`${code}\` deleted.` };
    }

    if (sub === "allow-role") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to manage paste roles." };
      }

      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }

      const entry = await blob.getJSON<PasteEntry>(blobKey(guildId, code));
      if (!entry) {
        return { success: false, error: `Paste \`${code}\` not found.` };
      }

      const roleId = options.role as string;
      entry.allowedRoles = entry.allowedRoles ?? [];
      if (entry.allowedRoles.includes(roleId)) {
        return { success: false, error: `Role <@&${roleId}> already has view permission for \`${code}\`.` };
      }

      entry.allowedRoles.push(roleId);
      await blob.setJSON(blobKey(guildId, code), entry);
      invalidateCache(guildId);

      return { success: true, message: `Role <@&${roleId}> can now view paste \`${code}\`.` };
    }

    if (sub === "deny-role") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to manage paste roles." };
      }

      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }

      const entry = await blob.getJSON<PasteEntry>(blobKey(guildId, code));
      if (!entry) {
        return { success: false, error: `Paste \`${code}\` not found.` };
      }

      const roleId = options.role as string;
      entry.allowedRoles = entry.allowedRoles ?? [];
      if (!entry.allowedRoles.includes(roleId)) {
        return { success: false, error: `Role <@&${roleId}> doesn't have view permission for \`${code}\`.` };
      }

      entry.allowedRoles = entry.allowedRoles.filter((r) => r !== roleId);
      await blob.setJSON(blobKey(guildId, code), entry);
      invalidateCache(guildId);

      return { success: true, message: `Role <@&${roleId}> can no longer view paste \`${code}\`.` };
    }

    if (sub === "allow-user") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to manage paste users." };
      }

      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }

      const entry = await blob.getJSON<PasteEntry>(blobKey(guildId, code));
      if (!entry) {
        return { success: false, error: `Paste \`${code}\` not found.` };
      }

      const targetUserId = options.user as string;
      entry.allowedUsers = entry.allowedUsers ?? [];
      if (entry.allowedUsers.includes(targetUserId)) {
        return { success: false, error: `User <@${targetUserId}> already has view permission for \`${code}\`.` };
      }

      entry.allowedUsers.push(targetUserId);
      await blob.setJSON(blobKey(guildId, code), entry);
      invalidateCache(guildId);

      return { success: true, message: `User <@${targetUserId}> can now view paste \`${code}\`.` };
    }

    if (sub === "deny-user") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to manage paste users." };
      }

      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }

      const entry = await blob.getJSON<PasteEntry>(blobKey(guildId, code));
      if (!entry) {
        return { success: false, error: `Paste \`${code}\` not found.` };
      }

      const targetUserId = options.user as string;
      entry.allowedUsers = entry.allowedUsers ?? [];
      if (!entry.allowedUsers.includes(targetUserId)) {
        return { success: false, error: `User <@${targetUserId}> doesn't have view permission for \`${code}\`.` };
      }

      entry.allowedUsers = entry.allowedUsers.filter((u) => u !== targetUserId);
      await blob.setJSON(blobKey(guildId, code), entry);
      invalidateCache(guildId);

      return { success: true, message: `User <@${targetUserId}> can no longer view paste \`${code}\`.` };
    }

    return { success: false, error: "Please use a subcommand." };
  },
});
