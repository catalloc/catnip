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

/**
 * Verify the Patreon webhook signature (MD5-HMAC in the X-Patreon-Signature header).
 */
async function verifySignature(
  body: string,
  signature: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CONFIG.patreonWebhookSecret),
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
  } catch {
    // Malformed payload — fall through
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
  } catch {
    return { patronStatus: "unknown", tier: "none" };
  }
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const requestTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  // Evict timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    return true;
  }
  requestTimestamps.push(now);
  return false;
}

export const _internals = { requestTimestamps, isRateLimited };

/**
 * Handle an incoming Patreon webhook request.
 * POST /patreon/webhook
 */
export async function handlePatreonWebhook(req: Request): Promise<Response> {
  if (isRateLimited()) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

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

  if (!(await verifySignature(body, signature))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("X-Patreon-Event");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const discordId = extractDiscordId(payload);

  if (!discordId) {
    // No Discord linked on Patreon — nothing to do, but acknowledge
    return Response.json({ ok: true, skipped: "no_discord_id" });
  }

  if (event === "members:delete") {
    await kv.delete(patreonKvKey(discordId));
    console.log(`[patreon] Deleted record for Discord ${discordId}`);
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
  console.log(`[patreon] Updated record for Discord ${discordId}: ${patronStatus}`);

  return Response.json({ ok: true, action: "updated" });
}
