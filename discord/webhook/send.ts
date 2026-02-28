import { CONFIG } from "../constants.ts";

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: EmbedField[];
}

interface WebhookOptions {
  username?: string;
  avatar_url?: string;
  content?: string;
}

interface SendResult {
  success: boolean;
  totalChunks?: number;
  sentDirectly?: number;
  usedFallback?: boolean;
  discordMessageIds?: string[];
  message?: string;
  error?: string;
}

const DISCORD_LIMITS = {
  contentLength: 2000,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  totalCharacters: 6000,
  embedsPerMessage: 10,
};

function truncateText(text: string | undefined, limit: number): string | undefined {
  if (!text) return undefined;
  if (text.length <= limit) return text;
  return text.substring(0, limit - 3) + "...";
}

function splitMessage(message: string): string[] {
  if (!message) return [];
  const MAX_SIZE = DISCORD_LIMITS.contentLength;
  if (message.length <= MAX_SIZE) return [message];

  const chunks: string[] = [];
  let startPos = 0;

  while (startPos < message.length) {
    let endPos = Math.min(startPos + MAX_SIZE, message.length);

    if (endPos < message.length) {
      const lastNewline = message.lastIndexOf("\n", endPos);
      if (lastNewline > startPos + MAX_SIZE / 2) {
        endPos = lastNewline + 1;
      } else {
        const lastSpace = message.lastIndexOf(" ", endPos);
        if (lastSpace > startPos + MAX_SIZE / 2) {
          endPos = lastSpace + 1;
        }
      }
    }

    chunks.push(message.slice(startPos, endPos));
    startPos = endPos;
  }

  return chunks;
}

function calculateEmbedSize(embed: Embed): number {
  let size = 0;
  if (embed.title) size += embed.title.length;
  if (embed.description) size += embed.description.length;
  if (embed.footer?.text) size += embed.footer.text.length;
  if (embed.author?.name) size += embed.author.name.length;
  if (embed.fields) {
    for (const field of embed.fields) {
      size += field.name.length + field.value.length;
    }
  }
  return size;
}

function sanitizeEmbed(embed: Embed): Embed {
  const sanitized: Embed = {};

  if (embed.title) sanitized.title = truncateText(embed.title, DISCORD_LIMITS.title);
  if (embed.description) sanitized.description = truncateText(embed.description, DISCORD_LIMITS.description);
  if (embed.url) sanitized.url = embed.url;
  if (embed.timestamp) sanitized.timestamp = embed.timestamp;
  if (embed.color !== undefined) sanitized.color = embed.color;

  if (embed.author) {
    sanitized.author = {
      name: truncateText(embed.author.name, DISCORD_LIMITS.authorName) || "",
      url: embed.author.url,
      icon_url: embed.author.icon_url,
    };
  }

  if (embed.footer) {
    sanitized.footer = {
      text: truncateText(embed.footer.text, DISCORD_LIMITS.footerText) || "",
      icon_url: embed.footer.icon_url,
    };
  }

  if (embed.image) sanitized.image = { url: embed.image.url };
  if (embed.thumbnail) sanitized.thumbnail = { url: embed.thumbnail.url };

  if (embed.fields && embed.fields.length > 0) {
    sanitized.fields = embed.fields.slice(0, DISCORD_LIMITS.fields).map((field) => ({
      name: truncateText(field.name, DISCORD_LIMITS.fieldName) || "\u200B",
      value: truncateText(field.value, DISCORD_LIMITS.fieldValue) || "\u200B",
      inline: field.inline,
    }));
  }

  return sanitized;
}

function chunkEmbeds(embeds: Embed[]): Embed[][] {
  if (embeds.length === 0) return [];

  const chunks: Embed[][] = [];
  let currentChunk: Embed[] = [];
  let currentChunkSize = 0;

  for (const embed of embeds) {
    const sanitized = sanitizeEmbed(embed);
    const embedSize = calculateEmbedSize(sanitized);

    if (
      currentChunk.length >= DISCORD_LIMITS.embedsPerMessage ||
      (currentChunkSize + embedSize > DISCORD_LIMITS.totalCharacters && currentChunk.length > 0)
    ) {
      chunks.push(currentChunk);
      currentChunk = [sanitized];
      currentChunkSize = embedSize;
    } else {
      currentChunk.push(sanitized);
      currentChunkSize += embedSize;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

interface DiscordSendResult {
  success: boolean;
  status?: number;
  error?: string;
  discordMessageId?: string;
  retryAfterMs?: number;
}

interface FallbackResult extends DiscordSendResult {
  usedFallback: boolean;
  webhookUsed: string;
}

async function sendToDiscordApi(
  url: string,
  payload: { content?: string; embeds?: Embed[]; username?: string; avatar_url?: string },
): Promise<DiscordSendResult> {
  const urlWithWait = url.includes("?") ? `${url}&wait=true` : `${url}?wait=true`;
  const requestBody = JSON.stringify(payload);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(urlWithWait, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (response.ok) {
        try {
          const data = await response.json();
          return { success: true, discordMessageId: data.id };
        } catch {
          return { success: true };
        }
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const retryAfterMs = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) : 1000;
        return { success: false, status: 429, retryAfterMs, error: "Rate limited" };
      }

      if (response.status >= 500 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const errorText = await response.text();
      return {
        success: false,
        status: response.status,
        error: errorText || `Discord API error (${response.status})`,
      };
    } catch (error) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

async function sendWithFallback(
  primaryUrl: string,
  payload: { content?: string; embeds?: Embed[]; username?: string; avatar_url?: string },
): Promise<FallbackResult> {
  const primaryResult = await sendToDiscordApi(primaryUrl, payload);

  if (primaryResult.success || primaryResult.status === 429) {
    return { ...primaryResult, usedFallback: false, webhookUsed: primaryUrl };
  }

  const isConfigError = primaryResult.status && [401, 403, 404].includes(primaryResult.status);
  if (isConfigError) {
    const defaultWebhook = CONFIG.discordConsoleWebhook;
    if (defaultWebhook && defaultWebhook !== primaryUrl) {
      const fallbackResult = await sendToDiscordApi(defaultWebhook, payload);
      return {
        ...fallbackResult,
        usedFallback: true,
        webhookUsed: defaultWebhook,
        error:
          fallbackResult.error ||
          `Primary webhook failed (${primaryResult.status}), fallback ${fallbackResult.success ? "succeeded" : "failed"}`,
      };
    }
  }

  return { ...primaryResult, usedFallback: false, webhookUsed: primaryUrl };
}

async function sendChunked(
  payloads: Array<{ content?: string; embeds?: Embed[]; username?: string; avatar_url?: string }>,
  webhookUrl: string,
): Promise<SendResult> {
  if (payloads.length === 0) {
    return { success: true, message: "No content to send" };
  }

  const results: SendResult = {
    success: false,
    totalChunks: payloads.length,
    sentDirectly: 0,
    usedFallback: false,
    discordMessageIds: [],
  };

  for (let i = 0; i < payloads.length; i++) {
    let sendResult = await sendWithFallback(webhookUrl, payloads[i]);

    if (!sendResult.success && sendResult.status === 429 && sendResult.retryAfterMs) {
      await new Promise((r) => setTimeout(r, sendResult.retryAfterMs));
      sendResult = await sendWithFallback(webhookUrl, payloads[i]);
    }

    if (sendResult.success) {
      if (sendResult.discordMessageId) {
        results.discordMessageIds!.push(sendResult.discordMessageId);
      }
      results.sentDirectly!++;
      if (sendResult.usedFallback) results.usedFallback = true;
    } else {
      results.error = sendResult.error;
      break;
    }
  }

  results.success = results.sentDirectly! > 0;
  return results;
}

/**
 * Unified send function - handles both text messages and embeds
 */
export async function send(
  content: string | Embed | Embed[],
  webhookUrl?: string,
  options: WebhookOptions = {},
): Promise<SendResult> {
  const resolvedUrl = webhookUrl || CONFIG.discordConsoleWebhook;
  if (!resolvedUrl) {
    return { success: false, error: "No webhook URL provided" };
  }

  if (typeof content === "string") {
    const payloads = splitMessage(content).map((chunk) => ({
      content: chunk.slice(0, DISCORD_LIMITS.contentLength),
      username: options.username,
      avatar_url: options.avatar_url,
    }));
    return sendChunked(payloads, resolvedUrl);
  }

  const embedArray = Array.isArray(content) ? content : [content];
  const payloads = chunkEmbeds(embedArray).map((chunk, i) => ({
    embeds: chunk,
    content: i === 0 ? options.content?.slice(0, DISCORD_LIMITS.contentLength) : undefined,
    username: options.username,
    avatar_url: options.avatar_url,
  }));
  return sendChunked(payloads, resolvedUrl);
}

export const _internals = {
  truncateText,
  splitMessage,
  calculateEmbedSize,
  sanitizeEmbed,
  chunkEmbeds,
  DISCORD_LIMITS,
};
