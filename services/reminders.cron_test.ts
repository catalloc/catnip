import "../test/_mocks/env.ts";
import { assertEquals, assert } from "@std/assert";
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
