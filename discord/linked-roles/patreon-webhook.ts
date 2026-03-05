/**
 * discord/linked-roles/patreon-webhook.ts
 *
 * Handles Patreon webhook events (members:create, members:update, members:delete).
 * Verifies the MD5-HMAC signature, extracts the Discord user ID from the
 * member's social connections, and writes/deletes the KV record.
 */

import { CONFIG } from "../constants.ts";
import { kv } from "../persistence/kv.ts";
import { patreonKvKey, type PatreonRecord } from "./verifiers/patreon.ts";
import { timingSafeEqual } from "../helpers/crypto.ts";
import { createLogger } from "../webhook/logger.ts";

const logger = createLogger("PatreonWebhook");

/**
 * Verify the Patreon webhook signature (MD5-HMAC in the X-Patreon-Signature header).
 */
async function verifySignature(
  body: string,
  signature: string,
): Promise<boolean> {
  if (!CONFIG.patreonWebhookSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CONFIG.patreonWebhookSecret),
    // NOTE: MD5-HMAC is required by the current Patreon webhook API specification.
    // Patreon signs X-Patreon-Signature with HMAC-MD5 — this is NOT a choice.
    { name: "HMAC", hash: "MD5" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(signed)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return await timingSafeEqual(hex, signature);
}

/** Extract the Discord user ID from the Patreon webhook payload. */
function extractDiscordId(payload: Record<string, unknown>): string | null {
  try {
    const included = payload.included as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(included)) return null;

    for (const resource of included) {
      if (resource.type !== "user") continue;
      const attrs = resource.attributes as Record<string, unknown> | undefined;
      const socials = attrs?.social_connections as Record<string, unknown> | undefined;
      const discord = socials?.discord as Record<string, unknown> | undefined;
      if (discord?.user_id) return discord.user_id as string;
    }
  } catch (err) {
    logger.warn(`Failed to extract Discord ID from Patreon payload: ${err instanceof Error ? err.message : String(err)}`);
  }
  return null;
}

/** Extract patron status and tier from the Patreon webhook payload. */
function extractMemberData(payload: Record<string, unknown>): {
  patronStatus: string;
  tier: string;
} {
  try {
    const data = payload.data as Record<string, unknown>;
    const attrs = data.attributes as Record<string, unknown>;
    const patronStatus = (attrs.patron_status as string) ?? "unknown";

    const relationships = data.relationships as Record<string, unknown> | undefined;
    const tierData = relationships?.currently_entitled_tiers as Record<string, unknown> | undefined;
    const tiers = tierData?.data as Array<Record<string, unknown>> | undefined;
    const tier = tiers?.[0]?.id as string ?? "none";

    return { patronStatus, tier };
  } catch (err) {
    logger.warn(`Failed to extract member data from Patreon payload: ${err instanceof Error ? err.message : String(err)}`);
    return { patronStatus: "unknown", tier: "none" };
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

interface RateLimitState {
  count: number;
  windowStart: number;
}

async function isRateLimited(sourceId: string): Promise<boolean> {
  let limited = false;
  await kv.update<RateLimitState>(`ratelimit:patreon:${sourceId}`, (current) => {
    const now = Date.now();
    if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
      return { count: 1, windowStart: now };
    }
    if (current.count >= RATE_LIMIT_MAX) {
      limited = true;
      return current;
    }
    return { count: current.count + 1, windowStart: current.windowStart };
  });
  return limited;
}

function extractCampaignId(payload: Record<string, unknown>): string {
  try {
    const data = payload?.data as Record<string, unknown> | undefined;
    const rels = data?.relationships as Record<string, unknown> | undefined;
    const campaign = rels?.campaign as Record<string, unknown> | undefined;
    const campaignData = campaign?.data as Record<string, unknown> | undefined;
    const id = campaignData?.id;
    if (typeof id === "string" && /^\d+$/.test(id)) return id;
  } catch { /* fall through */ }
  return "global";
}

export const _internals = { isRateLimited };

/**
 * Handle an incoming Patreon webhook request.
 * POST /patreon/webhook
 */
export async function handlePatreonWebhook(req: Request): Promise<Response> {
  if (!CONFIG.patreonWebhookSecret) {
    return Response.json(
      { error: "PATREON_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("X-Patreon-Signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const campaignId = extractCampaignId(payload);
  let rateLimited = false;
  try {
    rateLimited = await isRateLimited(campaignId);
  } catch (err) {
    logger.error("Rate limit check failed, allowing request:", err);
  }
  if (rateLimited) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  if (!(await verifySignature(body, signature))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("X-Patreon-Event");

  const discordId = extractDiscordId(payload);

  if (!discordId) {
    // No Discord linked on Patreon — nothing to do, but acknowledge
    return Response.json({ ok: true, skipped: "no_discord_id" });
  }

  if (event === "members:delete") {
    await kv.delete(patreonKvKey(discordId));
    logger.info(`Deleted record for Discord ${discordId}`);
    return Response.json({ ok: true, action: "deleted" });
  }

  // members:create or members:update
  const { patronStatus, tier } = extractMemberData(payload);
  const isPatron = patronStatus === "active_patron";

  const record: PatreonRecord = {
    isPatron,
    patronStatus,
    tier,
    updatedAt: new Date().toISOString(),
  };

  await kv.set(patreonKvKey(discordId), record);
  logger.info(`Updated record for Discord ${discordId}: ${patronStatus}`);

  return Response.json({ ok: true, action: "updated" });
}
