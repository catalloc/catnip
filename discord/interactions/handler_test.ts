import "../../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
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
