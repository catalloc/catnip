import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { kv } from "../persistence/kv.ts";
import { runCron, deliverWithRetry } from "./cron.ts";
import { createLogger, finalizeAllLoggers } from "../webhook/logger.ts";

function resetStore() {
  (sqlite as any)._reset();
}

// ── runCron ──

Deno.test("runCron: processes due items", async () => {
  resetStore();
  const key = "test:item1";
  await kv.set(key, { data: "hello" }, Date.now() - 1000);

  const processed: string[] = [];
  await runCron({
    name: "TestCron",
    prefix: "test:",
    process: async (entry) => {
      processed.push(entry.key);
    },
  });

  assertEquals(processed, [key]);
});

Deno.test("runCron: skips items not yet due", async () => {
  resetStore();
  await kv.set("test:future", { data: "hello" }, Date.now() + 60_000);

  const processed: string[] = [];
  await runCron({
    name: "TestCron",
    prefix: "test:",
    process: async (entry) => {
      processed.push(entry.key);
    },
  });

  assertEquals(processed, []);
});

Deno.test("runCron: handles process errors without crashing", async () => {
  resetStore();
  await kv.set("test:err", { data: "hello" }, Date.now() - 1000);

  await runCron({
    name: "TestCron",
    prefix: "test:",
    process: async () => {
      throw new Error("boom");
    },
  });
  // Should not throw
});

// ── deliverWithRetry ──

Deno.test("deliverWithRetry: successful delivery cleans up", async () => {
  resetStore();
  const key = "test:d1";
  await kv.set(key, { channelId: "c1", message: "hi" }, Date.now() - 1000);
  const logger = createLogger("Test");

  try {
    await deliverWithRetry({
      entry: { key, value: { channelId: "c1", message: "hi" } },
      deliver: async () => ({ ok: true }),
      logger,
      entityLabel: "test",
    });

    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    await finalizeAllLoggers();
  }
});

Deno.test("deliverWithRetry: permanent failure drops item", async () => {
  resetStore();
  const key = "test:d2";
  await kv.set(key, { channelId: "c1" }, Date.now() - 1000);
  const logger = createLogger("Test");

  try {
    await deliverWithRetry({
      entry: { key, value: { channelId: "c1" } },
      deliver: async () => ({ ok: false, status: 404, error: "Not Found" }),
      logger,
      entityLabel: "test",
    });

    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    await finalizeAllLoggers();
  }
});

Deno.test("deliverWithRetry: transient failure re-inserts with retryCount", async () => {
  resetStore();
  const key = "test:d3";
  await kv.set(key, { channelId: "c1" }, Date.now() - 1000);
  const logger = createLogger("Test");

  try {
    await deliverWithRetry({
      entry: { key, value: { channelId: "c1" } },
      deliver: async () => ({ ok: false, status: 502, error: "Bad Gateway" }),
      logger,
      entityLabel: "test",
    });

    const entry = await kv.get<{ retryCount: number }>(key);
    assert(entry !== null, "Should re-insert on transient failure");
    assertEquals(entry!.retryCount, 1);
  } finally {
    await finalizeAllLoggers();
  }
});

Deno.test("deliverWithRetry: drops after maxRetries", async () => {
  resetStore();
  const key = "test:d4";
  await kv.set(key, { channelId: "c1", retryCount: 4 }, Date.now() - 1000);
  const logger = createLogger("Test");

  try {
    await deliverWithRetry({
      entry: { key, value: { channelId: "c1", retryCount: 4 } },
      deliver: async () => ({ ok: false, status: 502, error: "Bad Gateway" }),
      logger,
      entityLabel: "test",
      maxRetries: 5,
    });

    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    await finalizeAllLoggers();
  }
});

Deno.test("deliverWithRetry: skips malformed entries when validate fails", async () => {
  resetStore();
  const key = "test:d5";
  await kv.set(key, {}, Date.now() - 1000);
  const logger = createLogger("Test");
  let deliverCalled = false;

  try {
    await deliverWithRetry({
      entry: { key, value: {} },
      deliver: async () => { deliverCalled = true; return { ok: true }; },
      validate: (v) => !!v.channelId,
      logger,
      entityLabel: "test",
    });

    assertEquals(deliverCalled, false);
  } finally {
    await finalizeAllLoggers();
  }
});

Deno.test("deliverWithRetry: handles deliver exception", async () => {
  resetStore();
  const key = "test:d6";
  await kv.set(key, { channelId: "c1" }, Date.now() - 1000);
  const logger = createLogger("Test");

  try {
    await deliverWithRetry({
      entry: { key, value: { channelId: "c1" } },
      deliver: async () => { throw new Error("network error"); },
      logger,
      entityLabel: "test",
    });

    const entry = await kv.get<{ retryCount: number }>(key);
    assert(entry !== null, "Should re-insert on exception");
    assertEquals(entry!.retryCount, 1);
  } finally {
    await finalizeAllLoggers();
  }
});
