import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { _internals } from "./handler.ts";
import { _internals as apiInternals } from "../discord-api.ts";

const {
  hexToUint8Array,
  parseSubcommandOptions,
  formatResultMessage,
  buildPayload,
  parseComponentType,
  ephemeralResponse,
  sendFollowup,
  verifyDiscordRequest,
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

// --- Additional unit tests ---

Deno.test("hexToUint8Array: odd-length string throws", () => {
  let threw = false;
  let errorMsg = "";
  try {
    hexToUint8Array("abc");
  } catch (e) {
    threw = true;
    errorMsg = (e as Error).message;
  }
  assertEquals(threw, true);
  assertEquals(errorMsg, "Invalid hex string");
});

Deno.test("hexToUint8Array: uppercase hex converts correctly", () => {
  const upper = hexToUint8Array("FF00AB");
  const lower = hexToUint8Array("ff00ab");
  assertEquals(upper, lower);
  assertEquals(upper, new Uint8Array([0xff, 0x00, 0xab]));
});

Deno.test("hexToUint8Array: non-hex characters throw", () => {
  let threw = false;
  let errorMsg = "";
  try {
    hexToUint8Array("gg");
  } catch (e) {
    threw = true;
    errorMsg = (e as Error).message;
  }
  assertEquals(threw, true);
  assertEquals(errorMsg, "Invalid hex string");
});

Deno.test("formatResultMessage: message takes priority over error", () => {
  const result = formatResultMessage({ success: false, message: "Custom", error: "Err" });
  assertEquals(result, "Custom");
});

Deno.test("buildPayload: non-ephemeral omits flags", () => {
  const payload = buildPayload("msg", undefined, false);
  assertEquals(payload.content, "msg");
  assertEquals(payload.flags, undefined);
});

Deno.test("buildPayload: includes embeds and components when provided", () => {
  const embed = { title: "Test Embed", color: 0x00ff00 };
  const components = [{ type: 1, components: [{ type: 2, label: "Click" }] }];
  const payload = buildPayload("test msg", { embed, components }, true);
  assertEquals(payload.content, "test msg");
  assertEquals(payload.flags, 64);
  assertEquals(payload.embeds, [embed]);
  assertEquals(payload.components, components);
});

Deno.test("ephemeralResponse: content-type is application/json", async () => {
  const res = ephemeralResponse("Test");
  assertEquals(res.headers.get("content-type")?.includes("application/json"), true);
});

// --- handleInteraction integration tests ---

import { signedRequest, signBody } from "../../test/_mocks/sign.ts";
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
import { mockFetch, restoreFetch, getCalls, setNextThrow } from "../../test/_mocks/fetch.ts";
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

// --- Batch 1b: autocomplete test ---

Deno.test("handleAutocomplete: unknown command returns empty choices", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  try {
    const req = await signedRequest(JSON.stringify({
      type: 4, // APPLICATION_COMMAND_AUTOCOMPLETE
      guild_id: "100000000000000001",
      data: { name: "nonexistent_autocomplete_xyz", options: [] },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 8); // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
    assertEquals(body.data.choices, []);
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

// --- Batch 1c: additional integration tests ---

Deno.test("handleInteraction: guild-only command in DM returns error", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      // No guild_id — simulates a DM
      data: { name: "ticket", options: [] },
      user: { id: "111" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "only be used in a server");
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: empty allowlist allows all guilds", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "777777777777777777",
      data: { name: "echo", options: [{ name: "message", type: 3, value: "test" }] },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 4);
    // Should NOT contain "not authorized for this server"
    assert(!body.data?.content?.includes("not authorized for this server"), `Expected allowed, got: ${body.data?.content}`);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
});

Deno.test("handleInteraction: invalid signature returns 401", async () => {
  const req = new Request("https://example.com/", {
    method: "POST",
    body: JSON.stringify({ type: 1 }),
    headers: {
      "X-Signature-Ed25519": "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "X-Signature-Timestamp": String(Math.floor(Date.now() / 1000)),
    },
  });
  const res = await handleInteraction(req);
  assertEquals(res.status, 401);
  const text = await res.text();
  assertStringIncludes(text, "Invalid signature");
});

Deno.test("handleInteraction: modal submit (type 5) routes to modal handler", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 5, // MODAL_SUBMIT
      guild_id: "100000000000000001",
      data: {
        custom_id: "feedback-modal",
        components: [
          { type: 1, components: [{ type: 4, custom_id: "feedback_topic", value: "Test Topic" }] },
          { type: 1, components: [{ type: 4, custom_id: "feedback_details", value: "Test Details" }] },
        ],
      },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 4); // CHANNEL_MESSAGE_WITH_SOURCE
    // Should not be an "Unsupported interaction type" error
    assert(!body.data?.content?.includes("Unsupported interaction type"), `Expected modal handler, got: ${body.data?.content}`);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: unsupported component type returns error", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  try {
    const req = await signedRequest(JSON.stringify({
      type: 3, // MESSAGE_COMPONENT
      guild_id: "100000000000000001",
      data: { component_type: 1, custom_id: "some-action-row" },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "Unsupported component type");
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: no handler for component returns error", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  try {
    const req = await signedRequest(JSON.stringify({
      type: 3, // MESSAGE_COMPONENT
      guild_id: "100000000000000001",
      data: { component_type: 2, custom_id: "nonexistent-handler-xyz" },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "No handler");
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test({ name: "handleInteraction: cooldown allows after expiry", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  // Pre-seed cooldown key with PAST expiry (already expired)
  const userId = "cooldown_expired_user";
  await kv.set(`cooldown:slow-echo:${userId}`, Date.now() - 10_000);
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "slow-echo", options: [{ name: "message", type: 3, value: "after expiry" }] },
      member: { user: { id: userId }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
      application_id: "11111111111111111",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    // Should NOT be cooldown-blocked — expired cooldown should allow through
    assert(!body.data?.content?.includes("Please wait"), `Expected no cooldown, got: ${body.data?.content}`);
    assertEquals(body.type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (slow-echo is deferred)
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
}});

Deno.test({ name: "handleInteraction: CAS exhaustion on cooldown allows command through", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  // Monkey-patch kv.update to throw (simulating CAS exhaustion)
  const origUpdate = kv.update;
  kv.update = () => { throw new Error("CAS exhaustion"); };
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "slow-echo", options: [{ name: "message", type: 3, value: "cas test" }] },
      member: { user: { id: "cas_user_123" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
      application_id: "11111111111111111",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    // CAS exhaustion should allow command through, not block
    assert(!body.data?.content?.includes("Please wait"), `Expected no cooldown block, got: ${body.data?.content}`);
    assertEquals(body.type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  } finally {
    kv.update = origUpdate;
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
}});

Deno.test("handleInteraction: truncated JSON body returns 400", async () => {
  const truncatedBody = '{"type": 2';
  const { signature, timestamp } = await signBody(truncatedBody);
  const req = new Request("https://example.com/", {
    method: "POST",
    body: truncatedBody,
    headers: {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": timestamp,
    },
  });
  const res = await handleInteraction(req);
  assertEquals(res.status, 400);
  const text = await res.text();
  assertStringIncludes(text, "Invalid JSON");
});

// === sendFollowup unit tests ===

Deno.test("sendFollowup: successful delivery calls fetch once with correct URL/body", async () => {
  apiInternals.resetIsolateStart();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await sendFollowup("app123", "tok456", "Hello!");
    const calls = getCalls();
    assertEquals(calls.length, 1);
    assertStringIncludes(calls[0].url, "webhooks/app123/tok456");
    const sentBody = JSON.parse(calls[0].init?.body as string);
    assertEquals(sentBody.content, "Hello!");
    assertEquals(sentBody.flags, 64);
  } finally {
    restoreFetch();
  }
});

Deno.test({ name: "sendFollowup: 429 then retry succeeds", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  apiInternals.resetIsolateStart();
  mockFetch({
    responses: [
      { status: 429, body: "rate limited", headers: { "Retry-After": "0.01" } },
      { status: 200, body: {} },
    ],
  });
  try {
    await sendFollowup("app123", "tok456", "retry test");
    const calls = getCalls();
    assertEquals(calls.length, 2);
  } finally {
    restoreFetch();
  }
}});

Deno.test("sendFollowup: 429 with insufficient time budget does not retry", async () => {
  // Simulate isolate started 9.5 minutes ago — nearly out of time
  apiInternals.setIsolateStart(Date.now() - 9.5 * 60 * 1000);
  mockFetch({
    responses: [
      { status: 429, body: "rate limited", headers: { "Retry-After": "1" } },
      { status: 200, body: {} },
    ],
  });
  try {
    await sendFollowup("app123", "tok456", "no budget");
    const calls = getCalls();
    assertEquals(calls.length, 1);
  } finally {
    restoreFetch();
    apiInternals.resetIsolateStart();
  }
});

Deno.test({ name: "sendFollowup: 5xx then retry succeeds", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  apiInternals.resetIsolateStart();
  mockFetch({
    responses: [
      { status: 502, body: "bad gateway" },
      { status: 200, body: {} },
    ],
  });
  try {
    await sendFollowup("app123", "tok456", "server error test");
    const calls = getCalls();
    assertEquals(calls.length, 2);
  } finally {
    restoreFetch();
  }
}});

Deno.test("sendFollowup: 5xx with insufficient time budget does not retry", async () => {
  apiInternals.setIsolateStart(Date.now() - 9.5 * 60 * 1000);
  mockFetch({
    responses: [
      { status: 502, body: "bad gateway" },
      { status: 200, body: {} },
    ],
  });
  try {
    await sendFollowup("app123", "tok456", "no budget for 5xx");
    const calls = getCalls();
    assertEquals(calls.length, 1);
  } finally {
    restoreFetch();
    apiInternals.resetIsolateStart();
  }
});

Deno.test({ name: "sendFollowup: network error then retry succeeds", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  apiInternals.resetIsolateStart();
  mockFetch({ default: { status: 200, body: {} } });
  setNextThrow(new Error("network failure"));
  try {
    await sendFollowup("app123", "tok456", "network retry");
    const calls = getCalls();
    assertEquals(calls.length, 2);
  } finally {
    restoreFetch();
  }
}});

Deno.test("sendFollowup: network error with insufficient time budget skips sleep and retries immediately", async () => {
  apiInternals.setIsolateStart(Date.now() - 9.5 * 60 * 1000);
  mockFetch({ default: { status: 200, body: {} } });
  setNextThrow(new Error("network failure"));
  try {
    await sendFollowup("app123", "tok456", "no budget network");
    const calls = getCalls();
    // First call throws (network error), logs error, then loop continues to attempt 1 which succeeds
    assertEquals(calls.length, 2);
  } finally {
    restoreFetch();
    apiInternals.resetIsolateStart();
  }
});

Deno.test("sendFollowup: non-retryable 4xx does not retry", async () => {
  apiInternals.resetIsolateStart();
  mockFetch({
    responses: [
      { status: 400, body: "bad request" },
      { status: 200, body: {} },
    ],
  });
  try {
    await sendFollowup("app123", "tok456", "bad request test");
    const calls = getCalls();
    assertEquals(calls.length, 1);
  } finally {
    restoreFetch();
  }
});

// === verifyDiscordRequest unit tests ===

Deno.test("verifyDiscordRequest: expired timestamp returns false", async () => {
  const result = await verifyDiscordRequest("{}", "aa".repeat(32), "1000000000");
  assertEquals(result, false);
});

Deno.test("verifyDiscordRequest: NaN timestamp returns false", async () => {
  const result = await verifyDiscordRequest("{}", "aa".repeat(32), "not-a-number");
  assertEquals(result, false);
});

Deno.test("verifyDiscordRequest: invalid hex signature returns false (caught exception)", async () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const result = await verifyDiscordRequest("{}", "zz", timestamp);
  assertEquals(result, false);
});

// === handleInteraction integration — remaining branch coverage ===

Deno.test({ name: "handleInteraction: fast command returning modal (feedback with webhook)", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  const origWebhook = Deno.env.get("FEEDBACK_WEBHOOK");
  Deno.env.set("FEEDBACK_WEBHOOK", "https://discord.com/api/webhooks/test/test");
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "feedback", options: [] },
      member: { user: { id: "111" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 9); // MODAL
    assertEquals(body.data.custom_id, "feedback-modal");
    assert(body.data.title);
    assert(body.data.components.length > 0);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    if (origWebhook) Deno.env.set("FEEDBACK_WEBHOOK", origWebhook);
    else Deno.env.delete("FEEDBACK_WEBHOOK");
  }
}});

Deno.test({ name: "handleInteraction: non-ephemeral deferred ACK has no flags", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  // slow-echo has ephemeral: false, so deferred ACK should not have flags
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      guild_id: "100000000000000001",
      data: { name: "slow-echo", options: [{ name: "message", type: 3, value: "non-ephemeral" }] },
      member: { user: { id: "non_eph_user_123" }, roles: [], permissions: "0" },
      id: "12345678",
      token: "tok",
      application_id: "11111111111111111",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertEquals(body.type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    assertEquals(body.data.flags, undefined);
  } finally {
    restoreFetch();
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
    resetStore();
  }
}});

Deno.test("handleInteraction: admin-only command in DM rejected", async () => {
  const origAllowed = Deno.env.get("ALLOWED_GUILD_IDS");
  Deno.env.delete("ALLOWED_GUILD_IDS");
  try {
    const req = await signedRequest(JSON.stringify({
      type: 2,
      // No guild_id — DM context
      data: { name: "server", options: [] },
      user: { id: "111" },
      id: "12345678",
      token: "tok",
    }));
    const res = await handleInteraction(req);
    const body = await res.json();
    assertStringIncludes(body.data.content, "only be used in a server");
  } finally {
    if (origAllowed) Deno.env.set("ALLOWED_GUILD_IDS", origAllowed);
    else Deno.env.delete("ALLOWED_GUILD_IDS");
  }
});

Deno.test("handleInteraction: expired timestamp returns 401", async () => {
  const oldTimestamp = "1000000000"; // year 2001
  const bodyText = JSON.stringify({ type: 1 });
  const req = new Request("https://example.com/", {
    method: "POST",
    body: bodyText,
    headers: {
      "X-Signature-Ed25519": "aa".repeat(32),
      "X-Signature-Timestamp": oldTimestamp,
    },
  });
  const res = await handleInteraction(req);
  assertEquals(res.status, 401);
  const text = await res.text();
  assertStringIncludes(text, "Invalid signature");
});

Deno.test("handleInteraction: NaN timestamp returns 401", async () => {
  const bodyText = JSON.stringify({ type: 1 });
  const req = new Request("https://example.com/", {
    method: "POST",
    body: bodyText,
    headers: {
      "X-Signature-Ed25519": "aa".repeat(32),
      "X-Signature-Timestamp": "abc",
    },
  });
  const res = await handleInteraction(req);
  assertEquals(res.status, 401);
  const text = await res.text();
  assertStringIncludes(text, "Invalid signature");
});
