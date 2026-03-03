import "../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
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
