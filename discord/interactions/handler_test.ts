import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { _internals } from "./handler.ts";

const {
  hexToUint8Array,
  parseSubcommandOptions,
  formatResultMessage,
  buildPayload,
  parseComponentType,
  ephemeralResponse,
} = _internals;

// --- hexToUint8Array ---

Deno.test("hexToUint8Array: converts hex string to bytes", () => {
  const result = hexToUint8Array("ff00ab");
  assertEquals(result, new Uint8Array([0xff, 0x00, 0xab]));
});

Deno.test("hexToUint8Array: empty string returns empty array", () => {
  assertEquals(hexToUint8Array(""), new Uint8Array([]));
});

// --- parseSubcommandOptions ---

Deno.test("parseSubcommandOptions: undefined options", () => {
  const result = parseSubcommandOptions(undefined);
  assertEquals(result, { subcommand: null, options: {} });
});

Deno.test("parseSubcommandOptions: empty array", () => {
  const result = parseSubcommandOptions([]);
  assertEquals(result, { subcommand: null, options: {} });
});

Deno.test("parseSubcommandOptions: flat options (no subcommand)", () => {
  const result = parseSubcommandOptions([
    { name: "text", type: 3, value: "hello" },
    { name: "count", type: 4, value: 5 },
  ]);
  assertEquals(result.subcommand, null);
  assertEquals(result.options, { text: "hello", count: 5 });
});

Deno.test("parseSubcommandOptions: with subcommand", () => {
  const result = parseSubcommandOptions([
    {
      name: "create",
      type: 1, // SUB_COMMAND
      options: [
        { name: "title", type: 3, value: "My Poll" },
      ],
    },
  ]);
  assertEquals(result.subcommand, "create");
  assertEquals(result.options, { title: "My Poll" });
});

Deno.test("parseSubcommandOptions: nested subcommand group", () => {
  const result = parseSubcommandOptions([
    {
      name: "settings",
      type: 2, // SUB_COMMAND_GROUP
      options: [
        {
          name: "view",
          type: 1, // SUB_COMMAND
          options: [
            { name: "key", type: 3, value: "theme" },
          ],
        },
      ],
    },
  ]);
  assertEquals(result.subcommand, "settings:view");
  assertEquals(result.options, { key: "theme" });
});

// --- formatResultMessage ---

Deno.test("formatResultMessage: prefers message field", () => {
  assertEquals(formatResultMessage({ success: true, message: "Done!" }), "Done!");
});

Deno.test("formatResultMessage: falls back to error field", () => {
  assertEquals(formatResultMessage({ success: false, error: "Oops" }), "Error: Oops");
});

Deno.test("formatResultMessage: success default", () => {
  assertEquals(formatResultMessage({ success: true }), "Command completed");
});

Deno.test("formatResultMessage: failure default", () => {
  assertEquals(formatResultMessage({ success: false }), "Command failed");
});

// --- buildPayload ---

Deno.test("buildPayload: basic ephemeral message", () => {
  const payload = buildPayload("Hello");
  assertEquals(payload, { content: "Hello", flags: 64 });
});

Deno.test("buildPayload: with embed, components, non-ephemeral", () => {
  const payload = buildPayload("msg", { embed: { title: "T" }, components: [{ type: 1 }] }, false);
  assertEquals(payload.content, "msg");
  assertEquals(payload.embeds, [{ title: "T" }]);
  assertEquals(payload.components, [{ type: 1 }]);
  assertEquals(payload.flags, undefined);
});

Deno.test("buildPayload: default ephemeral with no result", () => {
  const payload = buildPayload("hi", undefined);
  assertEquals(payload, { content: "hi", flags: 64 });
});

// --- parseComponentType ---

Deno.test("parseComponentType: 2 is button", () => {
  assertEquals(parseComponentType(2), "button");
});

Deno.test("parseComponentType: 3-8 are select", () => {
  assertEquals(parseComponentType(3), "select");
  assertEquals(parseComponentType(5), "select");
  assertEquals(parseComponentType(8), "select");
});

Deno.test("parseComponentType: unsupported returns undefined", () => {
  assertEquals(parseComponentType(1), undefined);
  assertEquals(parseComponentType(9), undefined);
});

// --- ephemeralResponse ---

Deno.test("ephemeralResponse: returns JSON response with flags", async () => {
  const res = ephemeralResponse("Test message");
  const body = await res.json();
  assertEquals(body.type, 4); // CHANNEL_MESSAGE_WITH_SOURCE
  assertEquals(body.data.content, "Test message");
  assertEquals(body.data.flags, 64);
});

// --- handleInteraction integration tests ---

import { signedRequest } from "../../test/_mocks/sign.ts";
import { handleInteraction } from "./handler.ts";
import { assert, assertStringIncludes } from "../../test/assert.ts";

Deno.test("handleInteraction: missing signature returns 401", async () => {
  const req = new Request("https://example.com/", {
    method: "POST",
    body: "{}",
  });
  const res = await handleInteraction(req);
  assertEquals(res.status, 401);
  const text = await res.text();
  assertStringIncludes(text, "Missing signature");
});

Deno.test("handleInteraction: missing timestamp returns 401", async () => {
  const req = new Request("https://example.com/", {
    method: "POST",
    body: "{}",
    headers: { "X-Signature-Ed25519": "abcdef" },
  });
  const res = await handleInteraction(req);
  assertEquals(res.status, 401);
  const text = await res.text();
  assertStringIncludes(text, "Missing signature");
});

Deno.test("handleInteraction: PING returns PONG", async () => {
  const req = await signedRequest(JSON.stringify({ type: 1 }));
  const res = await handleInteraction(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.type, 1); // PONG
});

Deno.test("handleInteraction: unknown interaction type returns error message", async () => {
  const req = await signedRequest(JSON.stringify({ type: 99, guild_id: Deno.env.get("ALLOWED_GUILD_IDS")?.split(",")[0] }));
  const res = await handleInteraction(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.type, 4); // CHANNEL_MESSAGE_WITH_SOURCE
  assertStringIncludes(body.data.content, "Unsupported interaction type");
});

Deno.test("handleInteraction: unknown command returns error", async () => {
  const guildId = Deno.env.get("ALLOWED_GUILD_IDS")?.split(",")[0] ?? "";
  const req = await signedRequest(JSON.stringify({
    type: 2, // APPLICATION_COMMAND
    guild_id: guildId,
    data: { name: "nonexistent_command_xyz", options: [] },
    member: { user: { id: "111" }, roles: [], permissions: "0" },
    id: "12345678",
    token: "tok",
  }));
  const res = await handleInteraction(req);
  const body = await res.json();
  assertEquals(body.type, 4);
  assertStringIncludes(body.data.content, "Unknown command");
});

Deno.test("handleInteraction: deferred command returns type 5", async () => {
  const payload = buildPayload("test", { embed: { title: "T" } }, true);
  assertEquals(payload.flags, 64);
  assertEquals(payload.embeds, [{ title: "T" }]);
});

// --- Integration tests using signedRequest ---

import "../../test/_mocks/sqlite.ts";
import { mockFetch, restoreFetch, getCalls } from "../../test/_mocks/fetch.ts";
import { kv } from "../../discord/persistence/kv.ts";
import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("handleInteraction: guild allowlist blocks non-allowed guild", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.set("ALLOWED_GUILD_IDS", "999999999999999999");
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "111111111111111111",
      data: { name: "ping", options: [] },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "not authorized for this server");
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: guild allowlist allows PING regardless", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.set("ALLOWED_GUILD_IDS", "999999999999999999");
  try {
    const req = await signedRequest(JSON.stringify({ type: 1 }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 1); // PONG
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: admin-only command rejects non-admin user", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "server", options: [] },
      member: { user: { id: "222222222222222222" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "not authorized");
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
});

Deno.test({ name: "handleInteraction: admin-only command allows admin user", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: {
        name: "server",
        options: [{
          name: "info",
          type: 1,
        }],
      },
      member: { user: { id: "333333333333333333" }, roles: [], permissions: "8" }, // ADMINISTRATOR bit
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    // Should NOT be "not authorized" — server command with admin perms should work
    assert(!body.data?.content?.includes("not authorized"), `Expected authorized, got: ${body.data?.content}`);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
}});

Deno.test({ name: "handleInteraction: cooldown blocks rapid repeat", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  // Pre-seed cooldown key with future expiry for slow-echo (which has cooldown: 10)
  const userId = "444444444444444444";
  await kv.set(`cooldown:slow-echo:${userId}`, Date.now() + 30_000);
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "slow-echo", options: [{ name: "message", type: 3, value: "test" }] },
      member: { user: { id: userId }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
      application_id: "11111111111111111",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "Please wait");
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
}});

Deno.test("handleInteraction: fast command returns type 4 with response", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "echo", options: [{ name: "message", type: 3, value: "hello world" }] },
      member: { user: { id: "555555555555555555" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 4); // CHANNEL_MESSAGE_WITH_SOURCE
    assertStringIncludes(body.data.content, "hello world");
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
});

Deno.test("handleInteraction: button component returns handler response", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 3, // MESSAGE_COMPONENT
      guild_id: "100000000000000001",
      data: { component_type: 2, custom_id: "example-button" },
      member: { user: { id: "666" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 4);
    assert(body.data.content);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: select component returns handler response", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 3, // MESSAGE_COMPONENT
      guild_id: "100000000000000001",
      data: { component_type: 3, custom_id: "color-select", values: ["blue"] },
      member: { user: { id: "777" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    // color-select uses updateMessage: true, so type is 7 (UPDATE_MESSAGE)
    assertEquals(body.type, 7);
    assert(body.data);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: admin-only component rejects non-admin", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 3, // MESSAGE_COMPONENT
      guild_id: "100000000000000001",
      data: { component_type: 2, custom_id: "ticket-close:100000000000000001:999" },
      member: { user: { id: "888888888888888888" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "not authorized");
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
});

Deno.test({ name: "handleInteraction: deferred command returns type 5 (slow-echo)", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "slow-echo", options: [{ name: "message", type: 3, value: "deferred test" }] },
      member: { user: { id: "999999999999999999" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
      application_id: "11111111111111111",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
}});
