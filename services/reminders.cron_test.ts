import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, getCalls, restoreFetch } from "../test/_mocks/fetch.ts";
import type { Reminder } from "../discord/interactions/commands/remind.ts";
import runCron from "./reminders.cron.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    userId: "u1",
    guildId: "g1",
    channelId: "c1",
    message: "test",
    dueAt: Date.now() - 1000,
    createdAt: Date.now() - 60000,
    ...overrides,
  };
}

Deno.test("reminders cron: successful delivery cleans up KV", async () => {
  resetStore();
  const key = "reminder:u1:g1:1";
  await kv.set(key, makeReminder(), Date.now() - 1000);
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

Deno.test("reminders cron: 403 drops item permanently", async () => {
  resetStore();
  const key = "reminder:u1:g1:2";
  await kv.set(key, makeReminder(), Date.now() - 1000);
  mockFetch({ default: { status: 403, body: "Forbidden" } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: 404 drops item permanently", async () => {
  resetStore();
  const key = "reminder:u1:g1:3";
  await kv.set(key, makeReminder(), Date.now() - 1000);
  mockFetch({ default: { status: 404, body: "Not Found" } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: transient failure re-inserts with retryCount", async () => {
  resetStore();
  const key = "reminder:u1:g1:4";
  await kv.set(key, makeReminder(), Date.now() - 1000);
  mockFetch({ default: { status: 502, body: "Bad Gateway" } });
  try {
    await runCron();
    // After 5xx, discordBotFetch retries internally (2 attempts), then returns error
    // Cron should re-insert with retryCount
    const entry = await kv.get<Reminder>(key);
    assert(entry !== null, "Should re-insert on transient failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: drops after MAX_RETRIES", async () => {
  resetStore();
  const key = "reminder:u1:g1:5";
  await kv.set(key, makeReminder({ retryCount: 4 }), Date.now() - 1000);
  mockFetch({ default: { status: 502, body: "Bad Gateway" } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: empty list is no-op", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await runCron();
    assertEquals(getCalls().length, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: malformed reminder (missing channelId) is deleted", async () => {
  resetStore();
  const key = "reminder:u1:g1:6";
  await kv.set(
    key,
    { userId: "u1", guildId: "g1", message: "test", dueAt: Date.now() - 1000, createdAt: Date.now() - 60000 },
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

Deno.test("reminders cron: 500 error re-inserts with retryCount", async () => {
  resetStore();
  const key = "reminder:u1:g1:7";
  await kv.set(key, makeReminder(), Date.now() - 1000);
  mockFetch({ default: { status: 500, body: "Internal Server Error" } });
  try {
    await runCron();
    const entry = await kv.get<Reminder>(key);
    assert(entry !== null, "Should re-insert on 500 failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: 503 error re-inserts", async () => {
  resetStore();
  const key = "reminder:u1:g1:8";
  await kv.set(key, makeReminder(), Date.now() - 1000);
  mockFetch({ default: { status: 503, body: "Service Unavailable" } });
  try {
    await runCron();
    const entry = await kv.get<Reminder>(key);
    assert(entry !== null, "Should re-insert on 503 failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("reminders cron: multiple due reminders all processed", async () => {
  resetStore();
  const keys = ["reminder:u1:g1:9", "reminder:u1:g1:10", "reminder:u1:g1:11"];
  for (const key of keys) {
    await kv.set(key, makeReminder(), Date.now() - 1000);
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
