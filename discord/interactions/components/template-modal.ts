/**
 * Template Modal Handler
 *
 * Processes the modal submission from /template create and /template edit.
 * customId format: template-modal:{create|edit}:{guildId}:{name}
 *
 * File: discord/interactions/components/template-modal.ts
 */

import { defineComponent } from "../define-component.ts";
import { EmbedColors } from "../../constants.ts";
import { blob } from "../../persistence/blob.ts";
import { isValidPublicUrl } from "../../helpers/url.ts";
import type { TemplateEntry } from "../commands/template.ts";

function blobKey(guildId: string, name: string): string {
  return `template:${guildId}:${name}`;
}

/** Parse hex color string (e.g. "#5865f2" or "5865f2") to number. */
function parseColor(raw: string): number | null {
  const cleaned = raw.replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{1,6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

export default defineComponent({
  customId: "template-modal:",
  match: "prefix",
  type: "modal",
  adminOnly: true,

  async execute({ customId, userId, fields }) {
    // Parse customId: template-modal:{action}:{guildId}:{name}
    const parts = customId.split(":");
    if (parts.length < 4) {
      return { success: false, error: "Invalid modal ID." };
    }

    const action = parts[1]; // "create" or "edit"
    const guildId = parts[2];
    const name = parts.slice(3).join(":"); // name could theoretically contain colons (unlikely after sanitize)

    const title = (fields?.template_title ?? "").trim();
    const description = (fields?.template_description ?? "").trim();
    const colorRaw = (fields?.template_color ?? "").trim();
    const footer = (fields?.template_footer ?? "").trim();
    const imageUrl = (fields?.template_image_url ?? "").trim();

    if (!title || !description) {
      return { success: false, error: "Title and description are required." };
    }

    // Validate color
    let color: number | undefined;
    if (colorRaw) {
      const parsed = parseColor(colorRaw);
      if (parsed === null) {
        return { success: false, error: `Invalid color \`${colorRaw}\`. Use hex format like \`#5865f2\`.` };
      }
      color = parsed;
    }

    // Validate image URL
    if (imageUrl && !isValidPublicUrl(imageUrl)) {
      return { success: false, error: `Invalid image URL. Must start with \`http://\` or \`https://\`.` };
    }

    const now = new Date().toISOString();
    const key = blobKey(guildId, name);

    if (action === "create") {
      const entry: TemplateEntry = {
        title,
        description,
        color,
        footer: footer || undefined,
        imageUrl: imageUrl || undefined,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      await blob.setJSON(key, entry);

      return {
        success: true,
        message: "",
        embed: {
          title: "Template Created",
          description: `Template \`${name}\` has been created. Use \`/template preview ${name}\` to see it.`,
          color: EmbedColors.SUCCESS,
        },
      };
    }

    if (action === "edit") {
      const existing = await blob.getJSON<TemplateEntry>(key);
      if (!existing) {
        return { success: false, error: `Template \`${name}\` not found.` };
      }

      existing.title = title;
      existing.description = description;
      existing.color = color;
      existing.footer = footer || undefined;
      existing.imageUrl = imageUrl || undefined;
      existing.updatedAt = now;

      await blob.setJSON(key, existing);

      return {
        success: true,
        message: "",
        embed: {
          title: "Template Updated",
          description: `Template \`${name}\` has been updated.`,
          color: EmbedColors.SUCCESS,
        },
      };
    }

    return { success: false, error: "Invalid modal action." };
  },
});
