import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { mockFetch, getCalls, restoreFetch } from "../../test/_mocks/fetch.ts";
import {
  commandPayload,
  fetchRegisteredCommands,
  getGlobalCommands,
  getGuildRegistrableCommands,
  registerGlobalCommands,
  registerCommand,
  registerCommandsToGuild,
  deregisterCommandFromGuild,
  deregisterAllFromGuild,
} from "./registration.ts";

// --- commandPayload ---

Deno.test("commandPayload: slash command includes description and options", () => {
  const cmd = {
    name: "ping",
    description: "Health check",
    options: [{ name: "verbose", type: 5 }],
    type: 1,
    registration: { type: "global" as const },
    execute: async () => ({ success: true }),
  };
  const payload = commandPayload(cmd as any);
  assertEquals(payload.name, "ping");
  assertEquals(payload.description, "Health check");
  assertEquals(payload.options, [{ name: "verbose", type: 5 }]);
});

Deno.test("commandPayload: context menu command omits description and options", () => {
  const cmd = {
    name: "User Info",
    type: 2,
    registration: { type: "global" as const },
    execute: async () => ({ success: true }),
  };
  const payload = commandPayload(cmd as any);
  assertEquals(payload, { name: "User Info", type: 2 });
  assertEquals(payload.description, undefined);
  assertEquals(payload.options, undefined);
});

// --- getGlobalCommands / getGuildRegistrableCommands ---

Deno.test("getGlobalCommands: returns only global-type commands", () => {
  const globals = getGlobalCommands();
  for (const cmd of globals) {
    assertEquals(cmd.registration.type, "global");
  }
});

Deno.test("getGuildRegistrableCommands: returns only guild-type commands", () => {
  const guildCmds = getGuildRegistrableCommands();
  for (const cmd of guildCmds) {
    assertEquals(cmd.registration.type, "guild");
  }
});

// --- fetchRegisteredCommands ---

Deno.test("fetchRegisteredCommands: returns data on success", async () => {
  const mockData = [{ id: "1", name: "ping", description: "Health check" }];
  mockFetch({ default: { status: 200, body: mockData } });
  try {
    const result = await fetchRegisteredCommands();
    assertEquals(result, mockData);
  } finally {
    restoreFetch();
  }
});

Deno.test("fetchRegisteredCommands: throws on API failure", async () => {
  mockFetch({ default: { status: 500, body: { message: "Server error" } } });
  try {
    let threw = false;
    try {
      await fetchRegisteredCommands();
    } catch (err) {
      threw = true;
      assertEquals((err as Error).message.includes("Failed to fetch"), true);
    }
    assertEquals(threw, true);
  } finally {
    restoreFetch();
  }
});

// --- registerGlobalCommands ---

Deno.test("registerGlobalCommands: uses bulk overwrite (PUT)", async () => {
  mockFetch({ default: { status: 200, body: [] } });
  try {
    const results = await registerGlobalCommands();
    // All results should have guildId "global"
    for (const r of results) {
      assertEquals(r.guildId, "global");
    }
    // Should use PUT for bulk overwrite
    const calls = getCalls();
    if (calls.length > 0) {
      assertEquals(calls[0].init?.method, "PUT");
    }
  } finally {
    restoreFetch();
  }
});

// --- registerCommand ---

Deno.test("registerCommand: returns error for unknown command", async () => {
  const results = await registerCommand("nonexistent_command_xyz", "guild123");
  assertEquals(results.length, 1);
  assertEquals(results[0].success, false);
  assertEquals(results[0].error?.includes("not found"), true);
});

// --- registerCommandsToGuild ---

Deno.test("registerCommandsToGuild: always uses bulk overwrite (PUT)", async () => {
  mockFetch({ default: { status: 200, body: [] } });
  try {
    const results = await registerCommandsToGuild("guild123");
    // Should use PUT for bulk overwrite
    const calls = getCalls();
    if (calls.length > 0) {
      assertEquals(calls[0].init?.method, "PUT");
    }
    for (const r of results) {
      assertEquals(r.guildId, "guild123");
    }
  } finally {
    restoreFetch();
  }
});

// --- deregisterCommandFromGuild ---

Deno.test("deregisterCommandFromGuild: success when command not registered", async () => {
  mockFetch({ default: { status: 200, body: [] } }); // no commands
  try {
    const result = await deregisterCommandFromGuild("ping", "guild789");
    assertEquals(result.success, true);
    assertEquals(result.guildId, "guild789");
  } finally {
    restoreFetch();
  }
});

Deno.test("deregisterCommandFromGuild: deletes existing command", async () => {
  mockFetch({
    default: { status: 200, body: [{ id: "cmd42", name: "ping", description: "test" }] },
  });
  try {
    const result = await deregisterCommandFromGuild("ping", "guild789");
    assertEquals(result.success, true);
    const calls = getCalls();
    // First call is GET to fetch commands, subsequent calls include DELETE
    assert(calls.length >= 2);
    const deleteCall = calls.find((c) => c.init?.method === "DELETE");
    assert(deleteCall !== undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("deregisterCommandFromGuild: handles API error gracefully", async () => {
  mockFetch({
    responses: [
      { status: 200, body: [{ id: "cmd42", name: "ping", description: "test" }] },
      { status: 500, body: { message: "error" } },
    ],
  });
  try {
    const result = await deregisterCommandFromGuild("ping", "guildErr");
    assertEquals(result.guildId, "guildErr");
    // Should not throw, returns result object
    assertEquals(typeof result.success, "boolean");
  } finally {
    restoreFetch();
  }
});

// --- deregisterAllFromGuild ---

Deno.test("deregisterAllFromGuild: uses bulk overwrite with empty array", async () => {
  mockFetch({ default: { status: 200, body: [] } });
  try {
    const result = await deregisterAllFromGuild("guild999");
    assertEquals(result.success, true);
    const calls = getCalls();
    assertEquals(calls.length, 1);
    assertEquals(calls[0].init?.method, "PUT");
    const body = JSON.parse(calls[0].init?.body as string);
    assertEquals(body, []);
  } finally {
    restoreFetch();
  }
});

Deno.test("deregisterAllFromGuild: handles error gracefully", async () => {
  mockFetch({ default: { status: 500, body: { message: "fail" } } });
  try {
    const result = await deregisterAllFromGuild("guildFail");
    assertEquals(result.success, false);
  } finally {
    restoreFetch();
  }
});
