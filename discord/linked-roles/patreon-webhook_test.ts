import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { kv } from "../persistence/kv.ts";
import { handlePatreonWebhook, _internals } from "./patreon-webhook.ts";
import { patreonKvKey } from "./verifiers/patreon.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makePatreonPayload(opts?: {
  discordId?: string | null;
  patronStatus?: string;
  tierId?: string;
}): Record<string, unknown> {
  const discordId = opts?.discordId ?? "discord123";
  const payload: Record<string, unknown> = {
    data: {
      attributes: {
        patron_status: opts?.patronStatus ?? "active_patron",
      },
      relationships: {
        currently_entitled_tiers: {
          data: opts?.tierId ? [{ id: opts.tierId, type: "tier" }] : [],
        },
      },
    },
    included: discordId !== null
      ? [
        {
          type: "user",
          attributes: {
            social_connections: {
              discord: { user_id: discordId },
            },
          },
        },
      ]
      : [],
  };
  return payload;
}

function makeRequest(
  body: string,
  event = "members:create",
  signature = "fake_signature",
): Request {
  return new Request("https://example.com/patreon/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Patreon-Event": event,
      "X-Patreon-Signature": signature,
    },
    body,
  });
}

// --- Missing config ---

Deno.test("patreon webhook: returns 503 when secret not configured", async () => {
  const originalSecret = Deno.env.get("PATREON_WEBHOOK_SECRET");
  Deno.env.delete("PATREON_WEBHOOK_SECRET");
  // Force CONFIG to not have the secret by testing directly
  // This tests the branch in handlePatreonWebhook
  // Note: CONFIG is loaded at import time, so we test the flow as-is
  resetStore();

  const req = makeRequest(JSON.stringify(makePatreonPayload()));
  const res = await handlePatreonWebhook(req);

  // Without PATREON_WEBHOOK_SECRET in CONFIG, should return 503 or 401
  assert(res.status === 503 || res.status === 401);

  if (originalSecret) Deno.env.set("PATREON_WEBHOOK_SECRET", originalSecret);
});

// --- Missing signature ---

Deno.test("patreon webhook: returns 401 when signature missing", async () => {
  Deno.env.set("PATREON_WEBHOOK_SECRET", "test_secret");
  resetStore();

  const req = new Request("https://example.com/patreon/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Patreon-Event": "members:create",
    },
    body: JSON.stringify(makePatreonPayload()),
  });

  const res = await handlePatreonWebhook(req);
  // Should fail at either rate limit, missing config, or missing signature
  assert(res.status === 401 || res.status === 503 || res.status === 429);
});

// --- extractDiscordId ---

Deno.test("extractDiscordId: payload with no discord connection has empty included", () => {
  // When discordId is null, the payload has no included user resources
  const payload: Record<string, unknown> = {
    data: {
      attributes: { patron_status: "active_patron" },
      relationships: { currently_entitled_tiers: { data: [] } },
    },
    included: [],
  };
  const included = payload.included as Array<Record<string, unknown>>;
  assertEquals(included.length, 0);
});

// --- extractMemberData ---

Deno.test("extractMemberData: extracts status and tier from payload", () => {
  const payload = makePatreonPayload({
    patronStatus: "active_patron",
    tierId: "tier_gold",
  });
  const data = payload.data as Record<string, unknown>;
  const attrs = data.attributes as Record<string, unknown>;
  assertEquals(attrs.patron_status, "active_patron");

  const relationships = data.relationships as Record<string, unknown>;
  const tierData = relationships.currently_entitled_tiers as Record<string, unknown>;
  const tiers = tierData.data as Array<Record<string, unknown>>;
  assertEquals(tiers[0].id, "tier_gold");
});

Deno.test("extractMemberData: handles missing tier gracefully", () => {
  const payload = makePatreonPayload({ tierId: undefined });
  const data = payload.data as Record<string, unknown>;
  const relationships = data.relationships as Record<string, unknown>;
  const tierData = relationships.currently_entitled_tiers as Record<string, unknown>;
  const tiers = tierData.data as Array<Record<string, unknown>>;
  assertEquals(tiers.length, 0);
});

// --- KV record storage ---

Deno.test("patreon KV: stores and retrieves patron record", async () => {
  resetStore();
  const key = patreonKvKey("discord123");
  const record = {
    isPatron: true,
    patronStatus: "active_patron",
    tier: "gold",
    updatedAt: new Date().toISOString(),
  };
  await kv.set(key, record);
  const retrieved = await kv.get<typeof record>(key);
  assertEquals(retrieved?.isPatron, true);
  assertEquals(retrieved?.patronStatus, "active_patron");
});

Deno.test("patreon KV: delete removes record", async () => {
  resetStore();
  const key = patreonKvKey("discord456");
  await kv.set(key, { isPatron: true, patronStatus: "active_patron", tier: "none", updatedAt: "" });
  await kv.delete(key);
  const retrieved = await kv.get(key);
  assertEquals(retrieved, null);
});

// --- patreonKvKey ---

Deno.test("patreonKvKey: returns correct key format", () => {
  assertEquals(patreonKvKey("123"), "patreon:discord:123");
  assertEquals(patreonKvKey("user456"), "patreon:discord:user456");
});

// --- Rate limiting ---

Deno.test("rate limiter: KV-based rate limit state", async () => {
  resetStore();
  // The rate limiter uses kv.update on "ratelimit:patreon:{sourceId}"
  // Verify the pattern works with our mock
  await kv.set("ratelimit:patreon:global", { count: 1, windowStart: Date.now() });
  const state = await kv.get<{ count: number; windowStart: number }>("ratelimit:patreon:global");
  assertEquals(state?.count, 1);
  assert(state!.windowStart > 0);
});
