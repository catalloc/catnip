import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { commandsPath, discordBotFetch, remainingMs, _internals } from "./discord-api.ts";
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

// --- Time budget tests (using _internals) ---

Deno.test("remainingMs: returns positive value in fresh isolate", () => {
  _internals.resetIsolateStart();
  try {
    const ms = remainingMs();
    assert(ms > 0, `Expected positive remainingMs, got ${ms}`);
    assert(ms <= 9.5 * 60 * 1000, `Expected at most 570000, got ${ms}`);
  } finally {
    _internals.resetIsolateStart();
  }
});

Deno.test("discordBotFetch: 429 rejected when time budget insufficient", async () => {
  // Set isolate start far in the past so remainingMs is very small
  _internals.setIsolateStart(Date.now() - 9.5 * 60 * 1000 + 5000); // ~5s left
  mockFetch({
    responses: [
      { status: 429, body: "rate limited", headers: { "Retry-After": "10" } },
    ],
  });
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, false);
    assertEquals(result.status, 429);
    // Should NOT have retried (only 1 call)
    assertEquals(getCalls().length, 1);
  } finally {
    restoreFetch();
    _internals.resetIsolateStart();
  }
});

Deno.test("discordBotFetch: 5xx not retried when time budget insufficient", async () => {
  _internals.setIsolateStart(Date.now() - 9.5 * 60 * 1000 + 10000); // ~10s left, < 32s threshold
  mockFetch({
    responses: [
      { status: 500, body: "server error" },
    ],
  });
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, false);
    assertEquals(result.status, 500);
    assertEquals(getCalls().length, 1);
  } finally {
    restoreFetch();
    _internals.resetIsolateStart();
  }
});

Deno.test("discordBotFetch: network error not retried when time budget insufficient", async () => {
  _internals.setIsolateStart(Date.now() - 9.5 * 60 * 1000 + 10000); // ~10s left
  mockFetch({ default: { status: 200, body: {} } });
  setNextThrow(new Error("network down"));
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, false);
    assertEquals(result.status, 0);
    assert(result.error!.includes("network down"));
    assertEquals(getCalls().length, 1);
  } finally {
    restoreFetch();
    _internals.resetIsolateStart();
  }
});

Deno.test("discordBotFetch: max retries returns error after 2 attempts", async () => {
  _internals.resetIsolateStart(); // plenty of time
  mockFetch({
    responses: [
      { status: 500, body: "fail1" },
      { status: 500, body: "fail2" },
    ],
  });
  try {
    const result = await discordBotFetch("GET", "test");
    assertEquals(result.ok, false);
    assertEquals(result.status, 500);
    assertEquals(getCalls().length, 2);
  } finally {
    restoreFetch();
    _internals.resetIsolateStart();
  }
});
