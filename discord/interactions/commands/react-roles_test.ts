import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert, assertStringIncludes } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { mockFetch, getCalls, restoreFetch } from "../../../test/_mocks/fetch.ts";
import { kv } from "../../persistence/kv.ts";
import command from "./react-roles.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const ctx = (sub: string, opts: Record<string, unknown> = {}) =>
  ({ guildId, options: { subcommand: sub, ...opts } }) as any;

// --- add ---

Deno.test("react-roles add: creates role entry", async () => {
  resetStore();
  const result = await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "Gamer");
  assertStringIncludes(result.message!, "1/25");
});

Deno.test("react-roles add: rejects duplicate roleId", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  const result = await command.execute(ctx("add", { role: "r1", emoji: "🎯", label: "Gamer2" }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "already configured");
});

Deno.test("react-roles add: rejects at MAX_ROLES (25)", async () => {
  resetStore();
  for (let i = 0; i < 25; i++) {
    await command.execute(ctx("add", { role: `r${i}`, emoji: "🎮", label: `Role${i}` }));
  }
  const result = await command.execute(ctx("add", { role: "r25", emoji: "🎮", label: "TooMany" }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Maximum");
});

// --- remove ---

Deno.test("react-roles remove: removes existing role", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  const result = await command.execute(ctx("remove", { role: "r1" }));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "Removed");
});

Deno.test("react-roles remove: error for non-existent role", async () => {
  resetStore();
  const result = await command.execute(ctx("remove", { role: "r999" }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "not in the panel");
});

// --- list ---

Deno.test("react-roles list: empty returns hint", async () => {
  resetStore();
  const result = await command.execute(ctx("list"));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "No roles configured");
});

Deno.test("react-roles list: populated returns numbered embed", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  await command.execute(ctx("add", { role: "r2", emoji: "🎯", label: "Artist" }));
  const result = await command.execute(ctx("list"));
  assertEquals(result.success, true);
  assert(result.embed);
  assertStringIncludes(result.embed!.description!, "1.");
  assertStringIncludes(result.embed!.description!, "2.");
  assertStringIncludes(result.embed!.footer!.text, "2/25");
});

// --- send ---

Deno.test("react-roles send: empty roles rejects", async () => {
  resetStore();
  const result = await command.execute(ctx("send", { channel: "ch1" }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "No roles configured");
});

Deno.test("react-roles send: POST success stores messageId/channelId", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  mockFetch({ default: { status: 200, body: { id: "msg123" } } });
  try {
    const result = await command.execute(ctx("send", { channel: "ch1" }));
    assertEquals(result.success, true);
    assertStringIncludes(result.message!, "ch1");
    const config = await kv.get<any>("react-roles:g1");
    assertEquals(config.messageId, "msg123");
    assertEquals(config.channelId, "ch1");
  } finally {
    restoreFetch();
  }
});

Deno.test("react-roles send: PATCH existing message succeeds", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  // Set up config with existing messageId
  const config = await kv.get<any>("react-roles:g1");
  config.messageId = "msg123";
  config.channelId = "ch1";
  await kv.set("react-roles:g1", config);

  mockFetch({ default: { status: 200, body: { id: "msg123" } } });
  try {
    const result = await command.execute(ctx("send", { channel: "ch1" }));
    assertEquals(result.success, true);
    assertEquals(result.message, "Panel updated.");
  } finally {
    restoreFetch();
  }
});

Deno.test("react-roles send: PATCH 404 falls through to POST", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  const config = await kv.get<any>("react-roles:g1");
  config.messageId = "msg_old";
  config.channelId = "ch1";
  await kv.set("react-roles:g1", config);

  mockFetch({
    responses: [
      { status: 404, body: { message: "Unknown Message" } },
      { status: 200, body: { id: "msg_new" } },
    ],
  });
  try {
    const result = await command.execute(ctx("send", { channel: "ch2" }));
    assertEquals(result.success, true);
    assertStringIncludes(result.message!, "ch2");
  } finally {
    restoreFetch();
  }
});

Deno.test("react-roles send: POST failure returns error", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  mockFetch({ default: { status: 403, body: { message: "Missing Permissions" } } });
  try {
    const result = await command.execute(ctx("send", { channel: "ch1" }));
    assertEquals(result.success, false);
    assertStringIncludes(result.error!, "Failed to send panel");
  } finally {
    restoreFetch();
  }
});

// --- clear ---

Deno.test("react-roles clear: deletes config", async () => {
  resetStore();
  await command.execute(ctx("add", { role: "r1", emoji: "🎮", label: "Gamer" }));
  const result = await command.execute(ctx("clear"));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "deleted");
  assertEquals(await kv.get("react-roles:g1"), null);
});

// --- unknown subcommand ---

Deno.test("react-roles: unknown subcommand returns error", async () => {
  resetStore();
  const result = await command.execute(ctx("invalid"));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "subcommand");
});
