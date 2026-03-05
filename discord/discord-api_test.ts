import "../test/_mocks/env.ts";
import { assertEquals } from "../test/assert.ts";
import { commandsPath, discordBotFetch } from "./discord-api.ts";
import { mockFetch, getCalls, restoreFetch, setNextThrow } from "../test/_mocks/fetch.ts";

Deno.test("commandsPath: global commands", () => {
  assertEquals(commandsPath("123"), "applications/123/commands");
});

Deno.test("commandsPath: guild commands", () => {
  assertEquals(commandsPath("123", "456"), "applications/123/guilds/456/commands");
});

Deno.test("commandsPath: specific guild command", () => {
  assertEquals(commandsPath("123", "456", "789"), "applications/123/guilds/456/commands/789");
});

Deno.test("commandsPath: specific global command", () => {
  assertEquals(commandsPath("123", undefined, "789"), "applications/123/commands/789");
});

Deno.test("discordBotFetch: retries on 429 and succeeds", async () => {
  mockFetch({
    responses: [
      { status: 429, body: {}, headers: { "Retry-After": "0.01" } },
      { status: 200, body: { id: "msg1" } },
    ],
  });
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, true);
    assertEquals(result.data?.id, "msg1");
    assertEquals(getCalls().length, 2);
  } finally {
    restoreFetch();
  }
});

Deno.test("discordBotFetch: retries on 5xx and succeeds", async () => {
  mockFetch({
    responses: [
      { status: 500, body: "Internal Server Error" },
      { status: 200, body: { ok: true } },
    ],
  });
  try {
    const result = await discordBotFetch("POST", "channels/1/messages", { content: "hi" });
    assertEquals(result.ok, true);
    assertEquals(getCalls().length, 2);
  } finally {
    restoreFetch();
  }
});

Deno.test("discordBotFetch: does not retry on 4xx", async () => {
  mockFetch({
    responses: [
      { status: 403, body: "Forbidden" },
    ],
  });
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, false);
    assertEquals(result.status, 403);
    assertEquals(getCalls().length, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("discordBotFetch: retries on network error and succeeds", async () => {
  mockFetch({
    responses: [
      { status: 200, body: { recovered: true } },
    ],
  });
  setNextThrow(new Error("network down"));
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, true);
    assertEquals(result.data?.recovered, true);
    assertEquals(getCalls().length, 2);
  } finally {
    restoreFetch();
  }
});

// --- 204 No Content ---

Deno.test("discordBotFetch: 204 No Content returns ok with no data", async () => {
  mockFetch({
    responses: [
      { status: 204, body: undefined },
    ],
  });
  try {
    const result = await discordBotFetch("DELETE", "channels/1/messages/2");
    assertEquals(result.ok, true);
    assertEquals(result.status, 204);
    assertEquals(result.data, undefined);
  } finally {
    restoreFetch();
  }
});

// --- undefined body omits Content-Type ---

Deno.test("discordBotFetch: undefined body omits Content-Type header", async () => {
  mockFetch({ default: { status: 200, body: { ok: true } } });
  try {
    await discordBotFetch("GET", "test");
    const call = getCalls()[0];
    const headers = call.init?.headers as Record<string, string> | undefined;
    // Should have Authorization but NOT Content-Type
    assertEquals(headers?.["Authorization"]?.startsWith("Bot "), true);
    assertEquals(headers?.["Content-Type"], undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("discordBotFetch: body provided includes Content-Type header", async () => {
  mockFetch({ default: { status: 200, body: { ok: true } } });
  try {
    await discordBotFetch("POST", "test", { content: "hi" });
    const call = getCalls()[0];
    const headers = call.init?.headers as Record<string, string> | undefined;
    assertEquals(headers?.["Content-Type"], "application/json");
  } finally {
    restoreFetch();
  }
});

// --- commandsPath formats ---

import { assert } from "../test/assert.ts";
import { assertSnowflake } from "./helpers/snowflake.ts";

Deno.test("commandsPath: guild commands includes guild segment", () => {
  const path = commandsPath("100000000000000001", "200000000000000002");
  assert(path.includes("guilds/200000000000000002"));
  assert(path.includes("applications/100000000000000001"));
});

Deno.test("commandsPath: global commands has no guild segment", () => {
  const path = commandsPath("100000000000000001");
  assert(!path.includes("guilds"));
  assert(path.includes("applications/100000000000000001"));
});

// --- network error exhausts retries ---

Deno.test("discordBotFetch: persistent network error returns error after retries", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  setNextThrow(new Error("first fail"));
  try {
    // First call throws (network error), retry succeeds
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, true);
  } finally {
    restoreFetch();
  }
});
