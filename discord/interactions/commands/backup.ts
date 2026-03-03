/**
 * Backup - Guild data export/import via blob storage
 *
 * Subcommands:
 *   /backup export              — Snapshot guild data to blob
 *   /backup import <id>         — Restore from a backup
 *   /backup list                — Show available backups
 *   /backup delete <id>         — Remove a backup
 *
 * File: discord/interactions/commands/backup.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors } from "../../constants.ts";
import { blob } from "../../persistence/blob.ts";
import { kv } from "../../persistence/kv.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import type { TemplateEntry } from "./template.ts";

interface TagEntry {
  content: string;
  createdBy: string;
  createdAt: string;
}

interface BackupData {
  version: 1;
  guildId: string;
  createdBy: string;
  createdAt: string;
  data: {
    tags?: Record<string, TagEntry>;
    templates?: Record<string, TemplateEntry>;
    counter?: number;
  };
}

const MAX_BACKUPS = 5;
const AUTOCOMPLETE_CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;

function blobKey(guildId: string, id: string): string {
  return `backup:${guildId}:${id}`;
}

function blobPrefix(guildId: string): string {
  return `backup:${guildId}:`;
}

interface BackupListItem {
  id: string;
  data: BackupData;
  size: number;
}

async function listBackups(guildId: string): Promise<BackupListItem[]> {
  const prefix = blobPrefix(guildId);
  const entries = await blob.list(prefix);
  const items: BackupListItem[] = [];
  for (const e of entries) {
    const id = e.key.slice(prefix.length);
    const data = await blob.getJSON<BackupData>(e.key);
    if (data) items.push({ id, data, size: e.size });
  }
  return items;
}

const listCache = new Map<string, { items: BackupListItem[]; expiresAt: number }>();

async function listBackupsCached(guildId: string): Promise<BackupListItem[]> {
  const cacheKey = blobPrefix(guildId);
  const cached = listCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.items;
  const items = await listBackups(guildId);
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

export const _internals = { blobKey, blobPrefix };

export default defineCommand({
  name: "backup",
  description: "Export and import guild data",

  options: [
    {
      name: "export",
      description: "Snapshot guild data to a backup",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "import",
      description: "Restore from a backup",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "id",
          description: "Backup ID",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "list",
      description: "Show available backups",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "delete",
      description: "Remove a backup",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "id",
          description: "Backup ID",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
  ],

  registration: { type: "guild" },
  adminOnly: true,
  deferred: false,
  ephemeral: true,

  autocomplete(body, _config) {
    const guildId = body.guild_id;
    const options = body.data.options?.[0];
    const focused = options?.options?.find((o: any) => o.focused);
    const query = (focused?.value as string || "").toLowerCase();

    return (async () => {
      const items = await listBackupsCached(guildId);
      const filtered = query ? items.filter((i) => i.id.includes(query)) : items;
      return createAutocompleteResponse(
        filtered.map((i) => {
          const date = new Date(i.data.createdAt).toLocaleString();
          return { name: `${i.id} — ${date}`, value: i.id };
        }),
      );
    })();
  },

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;

    if (sub === "export") {
      // Check limit
      const existing = await blob.list(blobPrefix(guildId));
      if (existing.length >= MAX_BACKUPS) {
        return { success: false, error: `Maximum of ${MAX_BACKUPS} backups reached. Delete an old backup first.` };
      }

      // Gather data
      const tags = await kv.get<Record<string, TagEntry>>(`tags:${guildId}`);

      const templatePrefix = `template:${guildId}:`;
      const templateBlobs = await blob.list(templatePrefix);
      const templates: Record<string, TemplateEntry> = {};
      for (const e of templateBlobs) {
        const name = e.key.slice(templatePrefix.length);
        const entry = await blob.getJSON<TemplateEntry>(e.key);
        if (entry) templates[name] = entry;
      }

      const counter = await kv.get<number>(`counter:${guildId}`);

      const now = new Date().toISOString();
      const id = Date.now().toString(36);

      const backup: BackupData = {
        version: 1,
        guildId,
        createdBy: userId,
        createdAt: now,
        data: {
          ...(tags && Object.keys(tags).length > 0 ? { tags } : {}),
          ...(Object.keys(templates).length > 0 ? { templates } : {}),
          ...(counter !== null ? { counter } : {}),
        },
      };

      await blob.setJSON(blobKey(guildId, id), backup);
      invalidateCache(guildId);

      const parts: string[] = [];
      if (tags) parts.push(`${Object.keys(tags).length} tags`);
      if (Object.keys(templates).length > 0) parts.push(`${Object.keys(templates).length} templates`);
      if (counter !== null) parts.push("counter");

      return {
        success: true,
        message: "",
        embed: {
          title: "Backup Created",
          description: `Backup \`${id}\` created with ${parts.join(", ") || "no data"}.`,
          color: EmbedColors.SUCCESS,
          footer: { text: `${existing.length + 1}/${MAX_BACKUPS} backups` },
        },
      };
    }

    if (sub === "import") {
      const id = options.id as string;
      const backup = await blob.getJSON<BackupData>(blobKey(guildId, id));

      if (!backup) {
        return { success: false, error: `Backup \`${id}\` not found.` };
      }

      if (backup.guildId !== guildId) {
        return { success: false, error: "This backup belongs to a different guild." };
      }

      // Restore tags to KV
      if (backup.data.tags && Object.keys(backup.data.tags).length > 0) {
        await kv.set(`tags:${guildId}`, backup.data.tags);
      }

      // Restore templates to blob
      if (backup.data.templates) {
        for (const [name, entry] of Object.entries(backup.data.templates)) {
          await blob.setJSON(`template:${guildId}:${name}`, entry);
        }
      }

      // Restore counter
      if (backup.data.counter !== undefined) {
        await kv.set(`counter:${guildId}`, backup.data.counter);
      }

      const parts: string[] = [];
      if (backup.data.tags) parts.push(`${Object.keys(backup.data.tags).length} tags`);
      if (backup.data.templates) parts.push(`${Object.keys(backup.data.templates).length} templates`);
      if (backup.data.counter !== undefined) parts.push("counter");

      return {
        success: true,
        message: "",
        embed: {
          title: "Backup Restored",
          description: `Restored ${parts.join(", ") || "no data"} from backup \`${id}\`.`,
          color: EmbedColors.SUCCESS,
        },
      };
    }

    if (sub === "list") {
      const items = await listBackups(guildId);

      if (items.length === 0) {
        return { success: true, message: "No backups found. Use `/backup export` to create one." };
      }

      const lines = items.map((i) => {
        const date = new Date(i.data.createdAt).toLocaleString();
        const parts: string[] = [];
        if (i.data.data.tags) parts.push(`${Object.keys(i.data.data.tags).length} tags`);
        if (i.data.data.templates) parts.push(`${Object.keys(i.data.data.templates).length} templates`);
        if (i.data.data.counter !== undefined) parts.push("counter");
        return `\`${i.id}\` — ${date} by <@${i.data.createdBy}> (${parts.join(", ") || "empty"})`;
      });

      return {
        success: true,
        message: "",
        embed: {
          title: "Guild Backups",
          description: lines.join("\n"),
          color: EmbedColors.INFO,
          footer: { text: `${items.length}/${MAX_BACKUPS} backups` },
        },
      };
    }

    if (sub === "delete") {
      const id = options.id as string;
      const backup = await blob.getJSON<BackupData>(blobKey(guildId, id));

      if (!backup) {
        return { success: false, error: `Backup \`${id}\` not found.` };
      }

      await blob.delete(blobKey(guildId, id));
      invalidateCache(guildId);

      return { success: true, message: `Backup \`${id}\` deleted.` };
    }

    return { success: false, error: "Please use a subcommand: export, import, list, or delete." };
  },
});
