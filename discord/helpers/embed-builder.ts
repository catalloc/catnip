/**
 * discord/helpers/embed-builder.ts
 *
 * Fluent builder for Discord embeds using the canonical Embed type.
 */

import type { Embed, EmbedField } from "../webhook/send.ts";
import { EmbedColors } from "../constants.ts";

export class EmbedBuilder {
  private data: Embed = {};

  title(title: string): this {
    this.data.title = title;
    return this;
  }

  description(description: string): this {
    this.data.description = description;
    return this;
  }

  url(url: string): this {
    this.data.url = url;
    return this;
  }

  color(color: number): this {
    this.data.color = color;
    return this;
  }

  field(name: string, value: string, inline?: boolean): this {
    if (!this.data.fields) this.data.fields = [];
    this.data.fields.push({ name, value, inline });
    return this;
  }

  footer(text: string, iconUrl?: string): this {
    this.data.footer = { text, icon_url: iconUrl };
    return this;
  }

  image(url: string): this {
    this.data.image = { url };
    return this;
  }

  thumbnail(url: string): this {
    this.data.thumbnail = { url };
    return this;
  }

  author(name: string, url?: string, iconUrl?: string): this {
    this.data.author = { name, url, icon_url: iconUrl };
    return this;
  }

  timestamp(iso?: string): this {
    this.data.timestamp = iso ?? new Date().toISOString();
    return this;
  }

  // Presets
  success(description: string): this {
    this.data.color = EmbedColors.SUCCESS;
    this.data.description = description;
    return this;
  }

  error(description: string): this {
    this.data.color = EmbedColors.ERROR;
    this.data.description = description;
    return this;
  }

  info(description: string): this {
    this.data.color = EmbedColors.INFO;
    this.data.description = description;
    return this;
  }

  warning(description: string): this {
    this.data.color = EmbedColors.WARNING;
    this.data.description = description;
    return this;
  }

  build(): Embed {
    return { ...this.data };
  }
}

export function embed(): EmbedBuilder {
  return new EmbedBuilder();
}
