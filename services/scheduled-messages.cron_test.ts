import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
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

Deno.test("scheduled-messages cron: empty list is no-op", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    assertEquals(getCalls().length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: malformed entry (missing channelId) is deleted", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:6`;
  await kv.set(
    key,
    { guildId: "g1", content: "hello", sendAt: Date.now() - 1000, createdBy: "u1", createdAt: Date.now() - 60000 },
    Date.now() - 1000,
  );
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
    assertEquals(getCalls().length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: 500 error re-inserts with retryCount", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:7`;
  await kv.set(key, makeMessage(), Date.now() - 1000);
  mockFetch({ default: { status: 500, body: "Internal Server Error" } });
  try {
    await runCron();
    const entry = await kv.get<ScheduledMessage>(key);
    assert(entry !== null, "Should re-insert on 500 failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: 503 error re-inserts", async () => {
  resetStore();
  const key = `${KV_PREFIX}g1:8`;
  await kv.set(key, makeMessage(), Date.now() - 1000);
  mockFetch({ default: { status: 503, body: "Service Unavailable" } });
  try {
    await runCron();
    const entry = await kv.get<ScheduledMessage>(key);
    assert(entry !== null, "Should re-insert on 503 failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("scheduled-messages cron: multiple due messages all processed", async () => {
  resetStore();
  const keys = [`${KV_PREFIX}g1:9`, `${KV_PREFIX}g1:10`, `${KV_PREFIX}g1:11`];
  for (const key of keys) {
    await kv.set(key, makeMessage(), Date.now() - 1000);
  }
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    for (const key of keys) {
      const remaining = await kv.get(key);
      assertEquals(remaining, null, `${key} should be cleaned up`);
    }
    assert(getCalls().length >= 3, `Expected at least 3 fetch calls, got ${getCalls().length}`);
  } finally {
    restoreFetch();
  }
});
