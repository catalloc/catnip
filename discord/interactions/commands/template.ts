/**
 * Template - Embed builder & poster stored in blob storage
 *
 * Subcommands:
 *   /template create <name>                          — Open modal to build an embed (admin)
 *   /template edit <name>                            — Open pre-filled modal (admin)
 *   /template add-field <name> <field-name> <value>  — Add a field to embed (admin)
 *   /template remove-field <name> <field-name>       — Remove a field (admin)
 *   /template allow-role <name> <role>               — Grant role send permission (admin)
 *   /template deny-role <name> <role>                — Revoke role send permission (admin)
 *   /template allow-user <name> <user>               — Grant user send permission (admin)
 *   /template deny-user <name> <user>                — Revoke user send permission (admin)
 *   /template preview <name>                         — Show embed privately (anyone)
 *   /template send <name> [channel]                  — Post embed to channel (role/user-gated)
 *   /template list                                   — Show all templates (anyone)
 *   /template delete <name>                          — Remove a template (admin)
 *
 * File: discord/interactions/commands/template.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { EmbedColors, isGuildAdmin } from "../../constants.ts";
import { blob } from "../../persistence/blob.ts";
import { discordBotFetch } from "../../discord-api.ts";
import { createAutocompleteResponse } from "../patterns.ts";
import { ExpiringCache } from "../../helpers/cache.ts";
import { checkEntityAccess, blobAllow, blobDeny } from "../../helpers/permissions.ts";
import { formatPermissionInfo } from "../../helpers/format.ts";

export interface TemplateEntry {
  title: string;
  description: string;
  color?: number;
  footer?: string;
  imageUrl?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  allowedRoles?: string[];
  allowedUsers?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_TEMPLATES = 25;
const MAX_NAME_LENGTH = 32;

function blobKey(guildId: string, name: string): string {
  return `template:${guildId}:${name}`;
}

function blobPrefix(guildId: string): string {
  return `template:${guildId}:`;
}

/** Sanitize name: lowercase, alphanumeric + hyphens, max 32 chars. */
function sanitizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, MAX_NAME_LENGTH);
}

interface TemplateListItem {
  name: string;
  entry: TemplateEntry;
}

async function listTemplates(guildId: string): Promise<TemplateListItem[]> {
  const prefix = blobPrefix(guildId);
  const entries = await blob.list(prefix);
  const items: TemplateListItem[] = [];
  for (const e of entries) {
    const name = e.key.slice(prefix.length);
    const entry = await blob.getJSON<TemplateEntry>(e.key);
    if (entry) items.push({ name, entry });
  }
  return items;
}

const listCache = new ExpiringCache<string, TemplateListItem[]>(30_000, 500);

function invalidateCache(guildId: string): void {
  listCache.delete(blobPrefix(guildId));
}

/** Check if user has permission to send a template. Closed by default (admin-only when no restrictions). */
async function canSend(
  entry: TemplateEntry,
  guildId: string,
  userId: string,
  memberRoles: string[],
  memberPermissions?: string,
): Promise<boolean> {
  return checkEntityAccess(entry, guildId, userId, memberRoles, memberPermissions, { defaultOpen: false });
}

export const _internals = { sanitizeName, blobKey, blobPrefix, canSend };

export default defineCommand({
  name: "template",
  description: "Build and post reusable embed templates",

  options: [
    {
      name: "create",
      description: "Create a new embed template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name (lowercase, alphanumeric + hyphens)",
          type: OptionTypes.STRING,
          required: true,
          min_length: 1,
          max_length: MAX_NAME_LENGTH,
        },
      ],
    },
    {
      name: "edit",
      description: "Edit an existing template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "add-field",
      description: "Add a field to a template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "field-name",
          description: "Field title",
          type: OptionTypes.STRING,
          required: true,
          max_length: 256,
        },
        {
          name: "field-value",
          description: "Field content",
          type: OptionTypes.STRING,
          required: true,
          max_length: 1024,
        },
        {
          name: "inline",
          description: "Display field inline (default: false)",
          type: OptionTypes.BOOLEAN,
          required: false,
        },
      ],
    },
    {
      name: "remove-field",
      description: "Remove a field from a template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "field-name",
          description: "Field title to remove",
          type: OptionTypes.STRING,
          required: true,
        },
      ],
    },
    {
      name: "allow-role",
      description: "Grant a role permission to send this template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
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
      description: "Revoke a role's send permission (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
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
      description: "Grant a user permission to send this template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
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
      description: "Revoke a user's send permission (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
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
      name: "preview",
      description: "Preview an embed template privately",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: "send",
      description: "Post an embed template to a channel",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
          type: OptionTypes.STRING,
          required: true,
          autocomplete: true,
        },
        {
          name: "channel",
          description: "Target channel (admin only, defaults to current)",
          type: OptionTypes.CHANNEL,
          required: false,
        },
      ],
    },
    {
      name: "list",
      description: "Show all templates",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "delete",
      description: "Remove a template (admin)",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "name",
          description: "Template name",
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
    const guildId = body.guild_id;
    const options = body.data.options?.[0];
    const focused = options?.options?.find((o: any) => o.focused);
    const query = (focused?.value as string || "").toLowerCase();

    return (async () => {
      const items = await listCache.getOrFetch(blobPrefix(guildId), () => listTemplates(guildId));
      const filtered = query ? items.filter((i) => i.name.includes(query)) : items;
      return createAutocompleteResponse(
        filtered.map((i) => ({ name: i.name, value: i.name })),
      );
    })();
  },

  async execute({ guildId, userId, options, memberRoles, memberPermissions }) {
    const sub = options?.subcommand as string | undefined;
    const roles = memberRoles ?? [];

    if (sub === "create") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to create templates." };
      }

      const name = sanitizeName(options.name as string);
      if (!name) {
        return { success: false, error: "Invalid name. Use lowercase letters, numbers, and hyphens." };
      }

      const existing = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (existing) {
        return { success: false, error: `Template \`${name}\` already exists. Use \`/template edit\` to modify it.` };
      }

      // Check limit
      const all = await blob.list(blobPrefix(guildId));
      if (all.length >= MAX_TEMPLATES) {
        return { success: false, error: `Maximum of ${MAX_TEMPLATES} templates reached.` };
      }

      return {
        success: true,
        modal: {
          title: `Create Template: ${name.slice(0, 20)}`,
          custom_id: `template-modal:create:${guildId}:${name}`,
          components: buildModalComponents(),
        },
      };
    }

    if (sub === "edit") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to edit templates." };
      }

      const name = sanitizeName(options.name as string);
      const entry = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (!entry) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      return {
        success: true,
        modal: {
          title: `Edit Template: ${name.slice(0, 22)}`,
          custom_id: `template-modal:edit:${guildId}:${name}`,
          components: buildModalComponents(entry),
        },
      };
    }

    if (sub === "add-field") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to modify templates." };
      }

      const name = sanitizeName(options.name as string);
      const fieldName = options["field-name"] as string;
      const fieldValue = options["field-value"] as string;
      const inline = (options.inline as boolean) ?? false;

      const entry = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (!entry) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      entry.fields = entry.fields ?? [];
      if (entry.fields.length >= 25) {
        return { success: false, error: "Maximum of 25 fields per embed." };
      }

      entry.fields.push({ name: fieldName, value: fieldValue, inline });
      entry.updatedAt = new Date().toISOString();

      await blob.setJSON(blobKey(guildId, name), entry);
      invalidateCache(guildId);

      return { success: true, message: `Field \`${fieldName}\` added to template \`${name}\`.` };
    }

    if (sub === "remove-field") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to modify templates." };
      }

      const name = sanitizeName(options.name as string);
      const fieldName = options["field-name"] as string;

      const entry = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (!entry) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      const before = entry.fields?.length ?? 0;
      entry.fields = (entry.fields ?? []).filter((f) => f.name !== fieldName);
      if (entry.fields.length === before) {
        return { success: false, error: `Field \`${fieldName}\` not found in template \`${name}\`.` };
      }

      entry.updatedAt = new Date().toISOString();
      await blob.setJSON(blobKey(guildId, name), entry);
      invalidateCache(guildId);

      return { success: true, message: `Field \`${fieldName}\` removed from template \`${name}\`.` };
    }

    if (sub === "allow-role" || sub === "deny-role" || sub === "allow-user" || sub === "deny-user") {
      const name = sanitizeName(options.name as string);
      const isRole = sub.endsWith("-role");
      const isAllow = sub.startsWith("allow");
      const targetId = isRole ? (options.role as string) : (options.user as string);
      const handler = isAllow ? blobAllow : blobDeny;

      return handler({
        guildId, userId, memberRoles: roles, memberPermissions,
        entityName: name, entityLabel: "template", verb: "send",
        targetId, targetType: isRole ? "role" : "user",
        getEntry: () => blob.getJSON<TemplateEntry>(blobKey(guildId, name)),
        saveEntry: async (e) => {
          (e as TemplateEntry).updatedAt = new Date().toISOString();
          await blob.setJSON(blobKey(guildId, name), e);
        },
        invalidateCache: () => invalidateCache(guildId),
      });
    }

    if (sub === "preview") {
      const name = sanitizeName(options.name as string);
      const entry = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (!entry) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      return {
        success: true,
        message: "",
        embed: buildEmbed(entry),
      };
    }

    if (sub === "send") {
      const name = sanitizeName(options.name as string);
      const entry = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (!entry) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      if (!(await canSend(entry, guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You don't have permission to send this template." };
      }

      const isAdmin = await isGuildAdmin(guildId, userId, roles, memberPermissions);
      const channelId = (isAdmin && options.channel) ? (options.channel as string) : (options.channelId as string);

      const result = await discordBotFetch("POST", `channels/${channelId}/messages`, {
        embeds: [buildEmbed(entry)],
      });

      if (!result.ok) {
        return { success: false, error: `Failed to send embed: ${result.error}` };
      }

      return { success: true, message: `Template **${name}** sent to <#${channelId}>.` };
    }

    if (sub === "list") {
      const items = await listTemplates(guildId);

      if (items.length === 0) {
        return { success: true, message: "No templates found. Use `/template create` to create one." };
      }

      const lines = items.map((i) => {
        return `\`${i.name}\` — ${i.entry.title}${formatPermissionInfo(i.entry, "admin-only")}`;
      });

      return {
        success: true,
        message: "",
        embed: {
          title: "Embed Templates",
          description: lines.join("\n"),
          color: EmbedColors.INFO,
          footer: { text: `${items.length}/${MAX_TEMPLATES} templates` },
        },
      };
    }

    if (sub === "delete") {
      if (!(await isGuildAdmin(guildId, userId, roles, memberPermissions))) {
        return { success: false, error: "You need admin permissions to delete templates." };
      }

      const name = sanitizeName(options.name as string);
      const entry = await blob.getJSON<TemplateEntry>(blobKey(guildId, name));
      if (!entry) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      await blob.delete(blobKey(guildId, name));
      invalidateCache(guildId);

      return { success: true, message: `Template \`${name}\` deleted.` };
    }

    return { success: false, error: "Please use a subcommand." };
  },
});

/** Build the 5-field modal for create/edit. */
function buildModalComponents(existing?: TemplateEntry): any[] {
  return [
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: "template_title",
        label: "Title",
        style: 1,
        required: true,
        max_length: 256,
        value: existing?.title,
      }],
    },
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: "template_description",
        label: "Description",
        style: 2,
        required: true,
        max_length: 4000,
        value: existing?.description,
      }],
    },
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: "template_color",
        label: "Color",
        style: 1,
        required: false,
        placeholder: "#5865f2",
        value: existing?.color !== undefined ? `#${existing.color.toString(16).padStart(6, "0")}` : undefined,
      }],
    },
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: "template_footer",
        label: "Footer",
        style: 1,
        required: false,
        max_length: 2048,
        value: existing?.footer,
      }],
    },
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: "template_image_url",
        label: "Image URL",
        style: 1,
        required: false,
        value: existing?.imageUrl,
      }],
    },
  ];
}

/** Build a Discord embed from a template entry. */
function buildEmbed(entry: TemplateEntry): Record<string, any> {
  const embed: Record<string, any> = {
    title: entry.title,
    description: entry.description,
  };
  if (entry.color !== undefined) embed.color = entry.color;
  if (entry.footer) embed.footer = { text: entry.footer };
  if (entry.imageUrl) embed.image = { url: entry.imageUrl };
  if (entry.fields?.length) embed.fields = entry.fields;
  return embed;
}
