/**
 * discord/interactions/handler.ts
 *
 * Single source of truth for Discord interaction handling.
 * All HTTP endpoints should import from this module.
 */

import { getCommand, getComponentHandler } from "./registry.ts";
import type { Command, CommandResult } from "./define-command.ts";
import {
  InteractionResponseType,
  OptionTypes,
  createAutocompleteResponse,
} from "./patterns.ts";
import { createLogger } from "../webhook/logger.ts";
import { CONFIG, isGuildAdmin } from "../constants.ts";
import { UserFacingError } from "./errors.ts";
import type { ComponentContext } from "./define-component.ts";
import { kv } from "../persistence/kv.ts";
import { remainingMs } from "../discord-api.ts";

const INTERACTION_TYPES = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

const logger = createLogger("InteractionHandler", {
  minLevel: "info",
});

const DEFERRED_TIMEOUT_MS = 9 * 60 * 1000; // 9 minutes (pro account 10-min limit, 1-min buffer)

let cachedKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(CONFIG.publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  }
  return cachedKey;
}

function hexToUint8Array(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verifyDiscordRequest(
  body: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  try {
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (isNaN(age) || age > 5) return false;
    const key = await getPublicKey();
    const message = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify("Ed25519", key, hexToUint8Array(signature), message);
  } catch {
    return false;
  }
}

function ephemeralResponse(content: string): Response {
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: 64 },
  });
}

function buildPayload(
  message: string,
  result?: { embed?: any; components?: any[] },
  ephemeral = true,
): Record<string, any> {
  const data: Record<string, any> = { content: message };
  if (ephemeral) data.flags = 64;
  if (result?.embed) data.embeds = [result.embed];
  if (result?.components) data.components = result.components;
  return data;
}

/**
 * Extract subcommand name and nested options from Discord interaction data.
 */
function parseSubcommandOptions(
  dataOptions: any[] | undefined,
): { subcommand: string | null; options: Record<string, any> } {
  const options: Record<string, any> = {};
  let subcommand: string | null = null;

  if (!dataOptions || !Array.isArray(dataOptions)) {
    return { subcommand, options };
  }

  for (const opt of dataOptions) {
    if (
      opt.type === OptionTypes.SUB_COMMAND ||
      opt.type === OptionTypes.SUB_COMMAND_GROUP
    ) {
      subcommand = opt.name;
      if (opt.options && Array.isArray(opt.options)) {
        for (const nestedOpt of opt.options) {
          if (nestedOpt.type === OptionTypes.SUB_COMMAND) {
            subcommand = `${opt.name}:${nestedOpt.name}`;
            if (nestedOpt.options) {
              for (const innerOpt of nestedOpt.options) {
                options[innerOpt.name] = innerOpt.value;
              }
            }
          } else {
            options[nestedOpt.name] = nestedOpt.value;
          }
        }
      }
    } else {
      options[opt.name] = opt.value;
    }
  }

  return { subcommand, options };
}

function formatResultMessage(result: CommandResult): string {
  if (result.message) return result.message;
  if (result.error) return `Error: ${result.error}`;
  return result.success ? "Command completed" : "Command failed";
}

async function handleAutocompleteInteraction(body: any): Promise<Response> {
  const commandName = body.data.name;
  try {
    const cmd = getCommand(commandName);
    if (!cmd?.autocomplete) return createAutocompleteResponse([]);
    return await cmd.autocomplete(body, cmd.config);
  } catch (error) {
    logger.error(`Autocomplete error for ${commandName}:`, error);
    return createAutocompleteResponse([
      { name: "Error fetching options", value: "_error" },
    ]);
  }
}

async function handleSlashCommandInteraction(body: any): Promise<Response> {
  const commandName = body.data.name;
  const command = getCommand(commandName);

  if (!command) {
    return ephemeralResponse("Error: Unknown command");
  }

  const guildId = body.guild_id;
  const userId = body.member?.user?.id || body.user?.id;
  const ref = body.id?.slice(0, 8) ?? crypto.randomUUID().slice(0, 8);

  // Guild-only guard — guild-scoped commands cannot be used in DMs
  if (command.registration.type === "guild" && !body.guild_id) {
    return ephemeralResponse("This command can only be used in a server.");
  }

  // Admin-only guard
  if (command.adminOnly) {
    if (!body.guild_id) {
      return ephemeralResponse("This command can only be used in a server.");
    }
    const memberRoles: string[] = body.member?.roles || [];
    const authorized = await isGuildAdmin(guildId, userId, memberRoles, body.member?.permissions);
    if (!authorized) {
      return ephemeralResponse(
        "You are not authorized to use this command.",
      );
    }
  }

  // KV-backed cooldown — only runs when a command explicitly opts in
  if (command.cooldown && command.cooldown > 0) {
    const cooldownKey = `cooldown:${commandName}:${userId}`;
    const expiry = await kv.get<number>(cooldownKey);
    if (expiry !== null && Date.now() < expiry) {
      const remaining = Math.ceil((expiry - Date.now()) / 1000);
      return ephemeralResponse(
        `Please wait ${remaining} second${remaining !== 1 ? "s" : ""} before using this command again.`,
      );
    }
    // Clean up expired entry before writing the new one
    if (expiry !== null) await kv.delete(cooldownKey);
    const cooldownExpiry = Date.now() + command.cooldown * 1000;
    await kv.set(cooldownKey, cooldownExpiry, cooldownExpiry);
  }

  // Extract command options with subcommand support
  const { subcommand, options: parsedOptions } = parseSubcommandOptions(
    body.data.options,
  );

  const options: Record<string, any> = {
    ...parsedOptions,
    channelId: body.channel_id,
    interactionToken: body.token,
    interactionId: body.id,
  };

  if (subcommand) {
    options.subcommand = subcommand;
  }

  const logCtx = `[${ref}] [cmd:${commandName} guild:${guildId} user:${userId}]`;

  logger.info(
    `${logCtx} Processing${subcommand ? `:${subcommand}` : ""} inline`,
  );

  // Context menu data
  const targetId = body.data.target_id;
  const resolved = body.data.resolved;

  const memberRoles: string[] = body.member?.roles ?? [];
  const memberPermissions: string | undefined = body.member?.permissions;

  // Fast-command path — respond immediately without deferring
  if (command.deferred === false) {
    try {
      const result = await command.execute({
        guildId,
        userId,
        options,
        config: command.config,
        targetId,
        resolved,
        memberRoles,
        memberPermissions,
      });

      // Modal response (only valid for non-deferred commands)
      if (result.modal) {
        return Response.json({
          type: InteractionResponseType.MODAL,
          data: {
            title: result.modal.title,
            custom_id: result.modal.custom_id,
            components: result.modal.components,
          },
        });
      }

      const message = formatResultMessage(result);
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: buildPayload(message, result, command.ephemeral !== false),
      });
    } catch (error) {
      logger.error(`${logCtx} Error executing fast command:`, error);
      const msg = error instanceof UserFacingError
        ? error.userMessage
        : `Something went wrong with /${commandName} (ref: ${ref})`;
      return ephemeralResponse(`Error: ${msg}`);
    }
  }

  // Deferred path — return ACK directly, execute + followup in background

  (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DEFERRED_TIMEOUT_MS);
    try {
      const timeout = new Promise<never>((_, reject) => {
        ac.signal.addEventListener("abort", () => reject(new Error("Command execution timed out")), { once: true });
      });
      // Race covers both execute and followup so the combined time is bounded
      await Promise.race([
        (async () => {
          logger.info(`${logCtx} Executing...`);
          const result = await command.execute({
            guildId,
            userId,
            options,
            config: command.config,
            targetId,
            resolved,
            memberRoles,
            memberPermissions,
            signal: ac.signal,
          });
          const message = formatResultMessage(result);
          logger.info(`${logCtx} Sending followup`);
          await sendFollowup(body.application_id, body.token, message, result, command.ephemeral !== false);
          logger.info(`${logCtx} Completed successfully`);
        })(),
        timeout,
      ]);
    } catch (error) {
      logger.error(`${logCtx} Error executing:`, error);
      const userMsg = error instanceof UserFacingError
        ? error.userMessage
        : `Something went wrong with /${commandName} (ref: ${ref})`;
      try {
        await sendFollowup(body.application_id, body.token, `Error: ${userMsg}`);
      } catch (followupError) {
        logger.error(`${logCtx} Failed to send error followup:`, followupError);
      }
    } finally {
      clearTimeout(timer);
    }
  })().catch((error) => {
    logger.error(`${logCtx} Unhandled error in deferred execution:`, error);
  });

  const deferData: Record<string, any> = {};
  if (command.ephemeral !== false) deferData.flags = 64;
  return Response.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: deferData,
  });
}

async function sendFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  result?: { embed?: any; components?: any[] },
  ephemeral = true,
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  const body = JSON.stringify(buildPayload(content, result, ephemeral));

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) return;

      const errorBody = await response.text().catch(() => "");
      if (response.status === 429 && attempt === 0) {
        const retryAfter = parseFloat(response.headers.get("Retry-After") || "1") * 1000;
        const jitter = Math.random() * Math.min(retryAfter * 0.2, 2000);
        const totalWait = Math.min(retryAfter + jitter, 60_000);
        if (totalWait + 30_000 > remainingMs()) {
          logger.error(`Failed to send followup: 429 rate limited, insufficient time budget (${Math.round(remainingMs() / 1000)}s left)`);
          return;
        }
        await new Promise((r) => setTimeout(r, totalWait));
        continue;
      }
      if (response.status >= 500 && attempt === 0 && remainingMs() > 32_000) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
        continue;
      }
      logger.error(
        `Failed to send followup: ${response.status} ${errorBody}`,
      );
      return;
    } catch (error) {
      if (attempt === 0 && remainingMs() > 32_000) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      logger.error(
        `Failed to send followup (network): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function parseComponentType(discordType: number): "button" | "select" | undefined {
  if (discordType === 2) return "button";
  if (discordType >= 3 && discordType <= 8) return "select";
  return undefined;
}

async function handleInteractiveComponent(body: any, isModal: boolean): Promise<Response> {
  const customId: string = body.data.custom_id;
  const ref = body.id?.slice(0, 8);

  let handlerType: "button" | "select" | "modal";
  if (isModal) {
    handlerType = "modal";
  } else {
    const componentType = parseComponentType(body.data.component_type);
    if (!componentType) {
      return ephemeralResponse("Unsupported component type");
    }
    handlerType = componentType;
  }

  const handler = getComponentHandler(customId, handlerType);
  if (!handler) {
    return ephemeralResponse(`No handler for this ${isModal ? "modal" : "component"}`);
  }

  if (handler.adminOnly) {
    const userId = body.member?.user?.id || body.user?.id;
    if (!body.guild_id) {
      return ephemeralResponse("This action can only be used in a server.");
    }
    const memberRoles: string[] = body.member?.roles || [];
    const authorized = await isGuildAdmin(body.guild_id, userId, memberRoles, body.member?.permissions);
    if (!authorized) {
      return ephemeralResponse("You are not authorized to use this action.");
    }
  }

  try {
    const ctx: ComponentContext = {
      customId,
      guildId: body.guild_id,
      userId: body.member?.user?.id || body.user?.id,
      interaction: body,
      values: isModal ? undefined : body.data.values,
    };

    if (isModal) {
      const fields: Record<string, string> = {};
      for (const row of body.data.components ?? []) {
        for (const component of row.components ?? []) {
          if (component.custom_id && component.value !== undefined) {
            fields[component.custom_id] = component.value;
          }
        }
      }
      ctx.fields = fields;
    }

    const result = await handler.execute(ctx);

    // Return a modal dialog (only valid for non-modal component handlers)
    if (!isModal && result.modal) {
      return Response.json({
        type: InteractionResponseType.MODAL,
        data: {
          title: result.modal.title,
          custom_id: result.modal.custom_id,
          components: result.modal.components,
        },
      });
    }

    const responseType = !isModal && result.updateMessage
      ? InteractionResponseType.UPDATE_MESSAGE
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;
    const message = result.message || (result.error ? `Error: ${result.error}` : "Done");

    return Response.json({ type: responseType, data: buildPayload(message, result) });
  } catch (error) {
    logger.error(`[${ref}] ${isModal ? "Modal" : "Component"} error [${customId}]:`, error);
    const userMsg = error instanceof UserFacingError
      ? error.userMessage
      : `Something went wrong (ref: ${ref})`;
    return ephemeralResponse(`Error: ${userMsg}`);
  }
}

/**
 * Main entry point for handling Discord interactions.
 * Import and use this in your HTTP endpoint.
 *
 * @example
 * ```typescript
 * import { handleInteraction } from "../discord/interactions/handler.ts";
 *
 * export default async function(req: Request): Promise<Response> {
 *   return handleInteraction(req);
 * }
 * ```
 */
export async function handleInteraction(req: Request): Promise<Response> {
  try {
    const signature = req.headers.get("X-Signature-Ed25519");
    const timestamp = req.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Missing signature or timestamp", { status: 401 });
    }

    const bodyText = await req.text();
    const isValid = await verifyDiscordRequest(bodyText, signature, timestamp);

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Guild allowlist check — skip for PING (required by Discord); block DMs and unlisted guilds
    if (
      CONFIG.allowedGuildIds.length > 0 &&
      body.type !== INTERACTION_TYPES.PING &&
      (!body.guild_id || !CONFIG.allowedGuildIds.includes(body.guild_id))
    ) {
      return ephemeralResponse("This bot is not authorized for this server.");
    }

    switch (body.type) {
      case INTERACTION_TYPES.PING:
        return Response.json({ type: InteractionResponseType.PONG });

      case INTERACTION_TYPES.APPLICATION_COMMAND_AUTOCOMPLETE:
        return handleAutocompleteInteraction(body);

      case INTERACTION_TYPES.APPLICATION_COMMAND:
        return handleSlashCommandInteraction(body);

      case INTERACTION_TYPES.MESSAGE_COMPONENT:
        return handleInteractiveComponent(body, false);

      case INTERACTION_TYPES.MODAL_SUBMIT:
        return handleInteractiveComponent(body, true);

      default:
        return ephemeralResponse("Unsupported interaction type");
    }
  } catch (error) {
    logger.error("Interaction handler error:", error);
    return Response.json(
      {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "An error occurred while processing the interaction",
          flags: 64,
        },
      },
      { status: 500 },
    );
  }
}

export default handleInteraction;

export const _internals = {
  hexToUint8Array,
  parseSubcommandOptions,
  formatResultMessage,
  buildPayload,
  parseComponentType,
  ephemeralResponse,
};
