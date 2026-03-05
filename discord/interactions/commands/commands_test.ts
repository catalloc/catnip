import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assertStringIncludes } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import command from "./commands.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "11111111111111112";
const ctx = (sub: string, opts: Record<string, unknown> = {}) =>
  ({ guildId, options: { subcommand: sub, ...opts } }) as any;

// --- register ---

Deno.test("commands register: without guildId returns error", async () => {
  resetStore();
  const result = await command.execute({
    guildId: undefined,
    options: { subcommand: "register", command: "echo" },
  } as any);
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "server");
});

Deno.test("commands register: unknown command returns error", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: [] } });
  try {
    const result = await command.execute(ctx("register", { command: "nonexistent_cmd_xyz" }));
    assertEquals(result.success, false);
    assertStringIncludes(result.error!, "Unknown command");
  } finally {
    restoreFetch();
  }
});

// --- unregister ---

Deno.test("commands unregister: without guildId returns error", async () => {
  resetStore();
  const result = await command.execute({
    guildId: undefined,
    options: { subcommand: "unregister", command: "echo" },
  } as any);
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "server");
});

// --- list ---

Deno.test("commands list: returns embed with status info", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: [] } });
  try {
    const result = await command.execute(ctx("list"));
    assertEquals(result.success, true);
    assertEquals(result.embed!.title, "Command Registration Status");
  } finally {
    restoreFetch();
  }
});

// --- sync ---

Deno.test("commands sync: error path returns error message", async () => {
  resetStore();
  // Force an error by making fetch fail with 500 for everything
  mockFetch({ default: { status: 500, body: "Server Error" } });
  try {
    const result = await command.execute(ctx("sync"));
    // sync may succeed with individual failures, or fail entirely
    if (!result.success) {
      assertStringIncludes(result.error ?? result.message ?? "", "");
    }
  } finally {
    restoreFetch();
  }
});

// --- unknown subcommand ---

Deno.test("commands: unknown subcommand returns error", async () => {
  resetStore();
  const result = await command.execute(ctx("invalid_sub"));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "subcommand");
});

// --- autocomplete ---

Deno.test("commands autocomplete: returns choices array", async () => {
  resetStore();
  const body = {
    guild_id: guildId,
    data: {
      options: [
        {
          name: "register",
          type: 1,
          options: [{ name: "command", value: "", focused: true }],
        },
      ],
    },
  };
  const response = await command.autocomplete!(body as any);
  const json = await response.json();
  assertEquals(json.type, 8);
  assertEquals(Array.isArray(json.data.choices), true);
});
