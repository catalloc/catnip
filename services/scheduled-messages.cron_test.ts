import "../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../test/_mocks/fetch.ts";
import type { ScheduledMessage } from "../discord/interactions/commands/schedule.ts";
import { KV_PREFIX } from "../discord/interactions/commands/schedule.ts";
import runCron from "./scheduled-messages.cron.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeMessage(overrides?: Partial<ScheduledMessage>): ScheduledMessage {
  return {
    guildId: "g1",
    channelId: "c1",
    content: "hello",
    sendAt: Date.now() - 1000,
    createdBy: "u1",
    createdAt: Date.now() - 60000,
    ...overrides,
  };
}

Deno.test("scheduled-messages cron: successful delivery cleans up KV", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:1`;
  await kv.set(key, makeMessage(), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
    assertEquals(getCalls().length, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: 403 drops item permanently", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:2`;
  await kv.set(key, makeMessage(), Date.now() - 1000);
  mockFetch({ default: { status: 403, body: "Forbidden" } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: 404 drops item permanently", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:3`;
  await kv.set(key, makeMessage(), Date.now() - 1000);
  mockFetch({ default: { status: 404, body: "Not Found" } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: transient failure re-inserts with retryCount", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:4`;
  await kv.set(key, makeMessage(), Date.now() - 1000);
  mockFetch({ default: { status: 502, body: "Bad Gateway" } });
  try {
    await runCron();
    const entry = await kv.get<ScheduledMessage>(key);
    assert(entry !== null, "Should re-insert on transient failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: drops after MAX_RETRIES", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:5`;
  await kv.set(key, makeMessage({ retryCount: 4 }), Date.now() - 1000);
  mockFetch({ default: { status: 502, body: "Bad Gateway" } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});
