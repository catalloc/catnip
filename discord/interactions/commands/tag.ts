/**
 * Tags - Custom text snippets stored in KV
 *
 * Subcommands:
 *   /tag view <name>           — Display tag content (role/user-gated)
 *   /tag add <name> <content>  — Create a new tag (admin-only)
 *   /tag edit <name> <content> — Update existing tag (admin-only)
 *   /tag remove <name>         — Delete a tag (admin-only)
 *   /tag allow-role <name> <role>  — Grant role view permission (admin)
 *   /tag deny-role <name> <role>   — Revoke role view permission (admin)
 *   /tag allow-user <name> <user>  — Grant user view permission (admin)
 *   /tag deny-user <name> <user>   — Revoke user view permission (admin)
 *   /tag list                  — Show all tag names
 *
 * File: discord/interactions/commands/tag.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors, isGuildAdmin } from "../../constants.ts";
import { kv } from "../../persistence/kv.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import { ExpiringCache } from "../../helpers/cache.ts";
import { checkEntityAccess, kvAllow, kvDeny, type PermissionEntry } from "../../helpers/permissions.ts";
import { formatPermissionInfo } from "../../helpers/format.ts";

export interface TagEntry {
  content: string;
  allowedRoles?: string[];
  allowedUsers?: string[];
  createdBy: string;
  createdAt: string;
}

interface TagStore {
  [name: string]: TagEntry;
}

const MAX_TAGS = 50;
const MAX_TAG_NAME_LENGTH = 64;

const tagCache = new ExpiringCache<string, TagStore>(30_000, 500);

function kvKey(guildId: string): string {
  return `tags:${guildId}`;
}

/** Strip backticks and control chars to prevent markdown injection in error messages. */
function sanitizeTagName(raw: string): string {
  return raw.toLowerCase().replace(/[`\\*_~|<>]/g, "").slice(0, MAX_TAG_NAME_LENGTH);
}

async function getTags(guildId: string): Promise<TagStore> {
  return (await kv.get<TagStore>(kvKey(guildId))) ?? {};
}

/** Invalidate the autocomplete cache for a guild (call after mutations). */
function invalidateTagCache(guildId: string): void {
  tagCache.delete(kvKey(guildId));
}

export const _internals = { sanitizeTagName, kvKey, canView: checkEntityAccess };

export default defineCommand({
  name: "tag",
  description: "View and manage custom text tags",

  options: [
    {
      name: "view",
      description: "Display a tag's content",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Tag name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "add",
      description: "Create a new tag (admin-only)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Tag name (lowercase, no spaces)",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
        },
        {
          name: "content",
          description: "Tag content",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
          max_length: 2000,
        },
      ],
    },
    {
      name: "edit",
      description: "Update an existing tag (admin-only)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Tag name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "content",
          description: "New tag content",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
          max_length: 2000,
        },
      ],
    },
    {
      name: "remove",
      description: "Delete a tag (admin-only)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Tag name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "allow-role",
      description: "Grant a role permission to view this tag (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Tag name",
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
          name: "name",
          description: "Tag name",
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
      description: "Grant a user permission to view this tag (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Tag name",
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
          name: "name",
          description: "Tag name",
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
    {
      name: "list",
      description: "Show all available tags",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  autocomplete(body, _config) {
    const guildId = body.guild_id;
    const options = body.data.options?.[0]; // subcommand
    const focused = options?.options?.find((o: any) => o.focused);
    const query = (focused?.value as string || "").toLowerCase();

    return (async () => {
      const tags = await tagCache.getOrFetch(kvKey(guildId), () => getTags(guildId));
      const names = Object.keys(tags);
      const filtered = query
        ? names.filter((n) => n.includes(query))
        : names;
      return createAutocompleteResponse(
        filtered.map((n) => ({ name: n, value: n })),
      );
    })();
  },

  async execute({ guildId, userId, options, memberRoles, memberPermissions }) {
    const sub = options?.subcommand as string | undefined;
    const roles = memberRoles ?? [];

    if (sub === "view") {
      const name = sanitizeTagName(options.name as string);
      const tags = await getTags(guildId);
      const tag = tags[name];

      if (!tag) {
        return { success: false, error: `Tag \`${name}\` not found.` };
      }

      if (!(await checkEntityAccess(tag, guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You don't have permission to view this tag." };
      }

      return { success: true, message: tag.content };
    }

    if (sub === "add") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to add tags." };
      }

      const name = sanitizeTagName((options.name as string).replace(/\s+/g, "-"));
      const content = options.content as string;

      let error: string | null = null;
      await kv.update<TagStore>(kvKey(guildId), (current) => {
        const tags = current ?? {};
        if (tags[name]) {
          error = `Tag \`${name}\` already exists. Use \`/tag edit\` to update it.`;
          return tags;
        }
        if (Object.keys(tags).length >= MAX_TAGS) {
          error = `Maximum of ${MAX_TAGS} tags reached.`;
          return tags;
        }
        tags[name] = {
          content,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        };
        return tags;
      });
      invalidateTagCache(guildId);

      if (error) return { success: false, error };
      return { success: true, message: `Tag \`${name}\` created.` };
    }

    if (sub === "edit") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to edit tags." };
      }

      const name = sanitizeTagName(options.name as string);
      const content = options.content as string;

      let error: string | null = null;
      await kv.update<TagStore>(kvKey(guildId), (current) => {
        const tags = current ?? {};
        if (!tags[name]) {
          error = `Tag \`${name}\` not found.`;
          return tags;
        }
        tags[name].content = content;
        return tags;
      });
      invalidateTagCache(guildId);

      if (error) return { success: false, error };
      return { success: true, message: `Tag \`${name}\` updated.` };
    }

    if (sub === "remove") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to remove tags." };
      }

      const name = sanitizeTagName(options.name as string);

      let error: string | null = null;
      await kv.update<TagStore>(kvKey(guildId), (current) => {
        const tags = current ?? {};
        if (!tags[name]) {
          error = `Tag \`${name}\` not found.`;
          return tags;
        }
        delete tags[name];
        return tags;
      });
      invalidateTagCache(guildId);

      if (error) return { success: false, error };
      return { success: true, message: `Tag \`${name}\` deleted.` };
    }

    if (sub === "allow-role" || sub === "deny-role" || sub === "allow-user" || sub === "deny-user") {
      const name = sanitizeTagName(options.name as string);
      const isRole = sub.endsWith("-role");
      const isAllow = sub.startsWith("allow");
      const targetId = isRole ? (options.role as string) : (options.user as string);
      const handler = isAllow ? kvAllow : kvDeny;

      return handler({
        guildId, userId, memberRoles: roles, memberPermissions,
        entityName: name, entityLabel: "tag", verb: "view",
        targetId, targetType: isRole ? "role" : "user",
        kvUpdate: async (mutator) => {
          let error: string | null = null;
          await kv.update<TagStore>(kvKey(guildId), (current) => {
            const tags = current ?? {};
            const { entry, error: mutErr } = mutator(tags[name] ?? null);
            if (mutErr) {
              error = mutErr;
            } else if (entry) {
              tags[name] = entry as TagEntry;
            }
            return tags;
          });
          return error;
        },
        invalidateCache: () => invalidateTagCache(guildId),
      });
    }

    if (sub === "list") {
      const tags = await getTags(guildId);
      const names = Object.keys(tags);

      if (names.length === 0) {
        return { success: true, message: "No tags found. Use `/tag add` to create one." };
      }

      const lines = names.map((n) => {
        return `\`${n}\`${formatPermissionInfo(tags[n])}`;
      });

      return {
        success: true,
        message: "",
        embed: {
          title: "Available Tags",
          description: lines.join(", "),
          color: EmbedColors.INFO,
          footer: { text: `${names.length}/${MAX_TAGS} tags` },
        },
      };
    }

    return { success: false, error: "Please use a subcommand." };
  },
});
