/**
 * Stash - Personal clipboard snippets stored in blob storage
 *
 * Subcommands:
 *   /stash save <name> <content>  — Save a named snippet
 *   /stash get <name>             — Recall a snippet
 *   /stash list                   — Show all stash entries
 *   /stash delete <name>          — Remove a snippet
 *
 * File: discord/interactions/commands/stash.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { blob } from "../../persistence/blob.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import { ExpiringCache } from "../../helpers/cache.ts";

interface StashEntry {
  content: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_ENTRIES = 25;
const MAX_CONTENT_LENGTH = 4000;
const MAX_NAME_LENGTH = 32;

function blobKey(userId: string, name: string): string {
  return `stash:${userId}:${name}`;
}

function blobPrefix(userId: string): string {
  return `stash:${userId}:`;
}

/** Sanitize name: lowercase, alphanumeric + hyphens, max 32 chars. */
function sanitizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, MAX_NAME_LENGTH);
}

const listCache = new ExpiringCache<string, string[]>(30_000, 500);

async function listUserKeys(userId: string): Promise<string[]> {
  const prefix = blobPrefix(userId);
  const entries = await blob.list(prefix);
  return entries.map((e) => e.key.slice(prefix.length));
}

function invalidateCache(userId: string): void {
  listCache.delete(blobPrefix(userId));
}

export const _internals = { sanitizeName, blobKey, blobPrefix };

export default defineCommand({
  name: "stash",
  description: "Personal clipboard — save and recall text snippets",

  options: [
    {
      name: "save",
      description: "Save a named snippet",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Snippet name (lowercase, alphanumeric + hyphens)",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
          max_length: MAX_NAME_LENGTH,
        },
        {
          name: "content",
          description: "Snippet content",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
          max_length: MAX_CONTENT_LENGTH,
        },
      ],
    },
    {
      name: "get",
      description: "Recall a saved snippet",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Snippet name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "list",
      description: "Show all your stash entries",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "delete",
      description: "Remove a snippet",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Snippet name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,

  autocomplete(body, _config) {
    const userId = body.member?.user?.id ?? body.user?.id;
    const options = body.data.options?.[0];
    const focused = options?.options?.find((o: any) => o.focused);
    const query = (focused?.value as string || "").toLowerCase();

    return (async () => {
      const keys = await listCache.getOrFetch(blobPrefix(userId), () => listUserKeys(userId));
      const filtered = query ? keys.filter((k) => k.includes(query)) : keys;
      return createAutocompleteResponse(
        filtered.map((k) => ({ name: k, value: k })),
      );
    })();
  },

  async execute({ userId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "save") {
      const name = sanitizeName(options.name as string);
      if (!name) {
        return { success: false, error: "Invalid name. Use lowercase letters, numbers, and hyphens." };
      }

      const content = options.content as string;
      const existing = await blob.getJSON<StashEntry>(blobKey(userId, name));
      const now = new Date().toISOString();

      if (!existing) {
        // Check limit
        const keys = await listUserKeys(userId);
        if (keys.length >= MAX_ENTRIES) {
          return { success: false, error: `Maximum of ${MAX_ENTRIES} stash entries reached.` };
        }
      }

      const entry: StashEntry = {
        content,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await blob.setJSON(blobKey(userId, name), entry);
      invalidateCache(userId);

      const action = existing ? "updated" : "saved";
      return { success: true, message: `Stash \`${name}\` ${action}.` };
    }

    if (sub === "get") {
      const name = sanitizeName(options.name as string);
      const entry = await blob.getJSON<StashEntry>(blobKey(userId, name));

      if (!entry) {
        return { success: false, error: `Stash \`${name}\` not found.` };
      }

      return { success: true, message: entry.content };
    }

    if (sub === "list") {
      const keys = await listUserKeys(userId);

      if (keys.length === 0) {
        return { success: true, message: "No stash entries found. Use `/stash save` to create one." };
      }

      const stashEntries = await Promise.all(
        keys.map((name) => blob.getJSON<StashEntry>(blobKey(userId, name)).then((e) => ({ name, entry: e }))),
      );
      const entries = stashEntries.map(({ name, entry }) => {
        const preview = entry ? entry.content.slice(0, 50) + (entry.content.length > 50 ? "..." : "") : "";
        return `\`${name}\` — ${preview}`;
      });

      return {
        success: true,
        message: "",
        embed: {
          title: "Your Stash",
          description: entries.join("\n"),
          color: EmbedColors.INFO,
          footer: { text: `${keys.length}/${MAX_ENTRIES} entries` },
        },
      };
    }

    if (sub === "delete") {
      const name = sanitizeName(options.name as string);
      const entry = await blob.getJSON<StashEntry>(blobKey(userId, name));

      if (!entry) {
        return { success: false, error: `Stash \`${name}\` not found.` };
      }

      await blob.delete(blobKey(userId, name));
      invalidateCache(userId);

      return { success: true, message: `Stash \`${name}\` deleted.` };
    }

    return { success: false, error: "Please use a subcommand: save, get, list, or delete." };
  },
});
