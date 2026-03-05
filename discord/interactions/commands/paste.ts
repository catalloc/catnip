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
import { ExpiringCache } from "../../helpers/cache.ts";
import { checkEntityAccess, blobAllow, blobDeny } from "../../helpers/permissions.ts";
import { formatPermissionInfo } from "../../helpers/format.ts";

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
  const results = await Promise.all(
    entries.map(async (e) => {
      const code = e.key.slice(prefix.length);
      const entry = await blob.getJSON<PasteEntry>(e.key);
      return entry ? { code, entry } : null;
    }),
  );
  return results.filter((r): r is PasteListItem => r !== null);
}

const listCache = new ExpiringCache<string, PasteListItem[]>(30_000, 500);

function invalidateCache(guildId: string): void {
  listCache.delete(blobPrefix(guildId));
}

export const _internals = { blobKey, blobPrefix, generateCode, sanitizeCode, canGet: checkEntityAccess };

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
      const items = await listCache.getOrFetch(blobPrefix(guildId), () => listPastes(guildId));
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

      if (!(await checkEntityAccess(entry, guildId, userId, roles, memberPermissions))) {
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
        return `\`${i.code}\` — ${preview}${formatPermissionInfo(i.entry)}`;
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

    if (sub === "allow-role" || sub === "deny-role" || sub === "allow-user" || sub === "deny-user") {
      const code = sanitizeCode(options.code as string);
      if (!code) {
        return { success: false, error: "Invalid paste code." };
      }
      const isRole = sub.endsWith("-role");
      const isAllow = sub.startsWith("allow");
      const targetId = isRole ? (options.role as string) : (options.user as string);
      const handler = isAllow ? blobAllow : blobDeny;

      return handler({
        guildId, userId, memberRoles: roles, memberPermissions,
        entityName: code, entityLabel: "paste", verb: "view",
        targetId, targetType: isRole ? "role" : "user",
        getEntry: () => blob.getJSON<PasteEntry>(blobKey(guildId, code)),
        saveEntry: (e) => blob.setJSON(blobKey(guildId, code), e),
        invalidateCache: () => invalidateCache(guildId),
      });
    }

    return { success: false, error: "Please use a subcommand." };
  },
});
