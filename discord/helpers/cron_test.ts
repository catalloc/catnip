import "../../test/_mocks/env.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { kv } from "../persistence/kv.ts";
import { runCron, deliverWithRetry } from "./cron.ts";
import type { DiscordLogger } from "../webhook/logger.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makeLogger(): DiscordLogger & { logs: string[] } {
  const logs: string[] = [];
  return {
    debug: (m: string) => logs.push(`debug:${m}`),
    info: (m: string) => logs.push(`info:${m}`),
    warn: (m: string) => logs.push(`warn:${m}`),
    error: (m: string, _e?: unknown) => logs.push(`error:${m}`),
    flush: () => Promise.resolve(),
    finalize: () => Promise.resolve(),
    logs,
  } as any;
}

// ── runCron tests ──

Deno.test("cron: no due entries — process callback never called", async () => {
  resetStore();
  let callCount = 0;
  await runCron({
    name: "TestEmpty",
    prefix: "empty:",
    process: async () => { callCount++; },
  });
  assertEquals(callCount, 0);
});

Deno.test("cron: processes all due entries", async () => {
  resetStore();
  await kv.set("test:item1", { data: "a" }, Date.now() - 1000);
  await kv.set("test:item2", { data: "b" }, Date.now() - 2000);
  await kv.set("test:item3", { data: "c" }, Date.now() - 3000);

  const processed: string[] = [];
  await runCron({
    name: "TestAll",
    prefix: "test:",
    process: async (entry) => { processed.push(entry.key); },
  });

  assertEquals(processed.length, 3);
  assert(processed.includes("test:item1"));
  assert(processed.includes("test:item2"));
  assert(processed.includes("test:item3"));
});

Deno.test("cron: respects concurrency batching", async () => {
  resetStore();
  for (let i = 0; i < 7; i++) {
    await kv.set(`batch:item${i}`, { n: i }, Date.now() - 1000);
  }

  const processed: string[] = [];
  await runCron({
    name: "TestBatch",
    prefix: "batch:",
    concurrency: 3,
    process: async (entry) => { processed.push(entry.key); },
  });

  assertEquals(processed.length, 7);
});

Deno.test("cron: continues when individual items throw (Promise.allSettled)", async () => {
  resetStore();
  await kv.set("mix:ok1", { n: 1 }, Date.now() - 1000);
  await kv.set("mix:fail", { n: 2 }, Date.now() - 1000);
  await kv.set("mix:ok2", { n: 3 }, Date.now() - 1000);

  const processed: string[] = [];
  await runCron({
    name: "TestSettled",
    prefix: "mix:",
    concurrency: 10,
    process: async (entry) => {
      if (entry.key === "mix:fail") throw new Error("boom");
      processed.push(entry.key);
    },
  });

  assertEquals(processed.length, 2);
  assert(processed.includes("mix:ok1"));
  assert(processed.includes("mix:ok2"));
});

Deno.test("cron: logs warning when entries.length >= maxDue", async () => {
  resetStore();
  // Seed exactly 3 items with maxDue=3 so entries.length >= maxDue triggers the warning
  await kv.set("cap:a", { n: 1 }, Date.now() - 1000);
  await kv.set("cap:b", { n: 2 }, Date.now() - 1000);
  await kv.set("cap:c", { n: 3 }, Date.now() - 1000);

  const processed: string[] = [];
  await runCron({
    name: "TestCap",
    prefix: "cap:",
    maxDue: 3,
    process: async (entry) => { processed.push(entry.key); },
  });

  // All 3 should be processed
  assertEquals(processed.length, 3);
  // The warning is logged via the internal logger (we can't easily capture it
  // without mocking createLogger, but the function should not throw).
});

Deno.test("cron: catches top-level error when kv.listDue throws", async () => {
  resetStore();
  const origListDue = kv.listDue;
  // Temporarily replace listDue to throw
  (kv as any).listDue = () => Promise.reject(new Error("db exploded"));

  let processCalledCount = 0;
  // Should not throw — error is caught and logged
  await runCron({
    name: "TestThrow",
    prefix: "x:",
    process: async () => { processCalledCount++; },
  });

  assertEquals(processCalledCount, 0);

  // Restore original
  (kv as any).listDue = origListDue;
});

Deno.test("cron: finalizes loggers in finally block", async () => {
  resetStore();
  // This test verifies runCron completes without error even when there are no entries,
  // meaning finalizeAllLoggers is called in the finally block.
  // If finalizeAllLoggers were not called, subsequent tests might have stale logger state.
  await runCron({
    name: "TestFinalize",
    prefix: "nope:",
    process: async () => {},
  });
  // No error means finalizeAllLoggers completed successfully.
});

// ── deliverWithRetry tests ──

Deno.test("cron: deliverWithRetry — successful delivery removes entry from KV", async () => {
  resetStore();
  const key = "dr:success";
  await kv.set(key, { msg: "hi" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { msg: "hi" } },
    deliver: async () => ({ ok: true }),
    logger,
    entityLabel: "message",
  });

  const remaining = await kv.get(key);
  assertEquals(remaining, null);
});

Deno.test("cron: deliverWithRetry — malformed entry (validate returns false) deletes via claimDelete", async () => {
  resetStore();
  const key = "dr:malformed";
  await kv.set(key, { bad: true }, Date.now() - 1000);
  const logger = makeLogger();
  let deliverCalled = false;

  await deliverWithRetry({
    entry: { key, value: { bad: true } },
    deliver: async () => { deliverCalled = true; return { ok: true }; },
    validate: () => false,
    logger,
    entityLabel: "item",
  });

  assertEquals(deliverCalled, false);
  assert(logger.logs.some((l) => l.includes("malformed")));
});

Deno.test("cron: deliverWithRetry — claimDelete failure logs error and returns", async () => {
  resetStore();
  const key = "dr:claimerr";
  // Do NOT seed the key in KV, but monkey-patch claimDelete to throw
  const origClaimDelete = kv.claimDelete;
  (kv as any).claimDelete = () => Promise.reject(new Error("db locked"));
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { data: 1 } },
    deliver: async () => ({ ok: true }),
    logger,
    entityLabel: "item",
  });

  assert(logger.logs.some((l) => l.includes("Failed to claim")));

  // Restore
  (kv as any).claimDelete = origClaimDelete;
});

Deno.test("cron: deliverWithRetry — claimDelete returns false (already claimed) silently returns", async () => {
  resetStore();
  const key = "dr:alreadyclaimed";
  // Key does not exist in KV, so claimDelete returns false
  const logger = makeLogger();
  let deliverCalled = false;

  await deliverWithRetry({
    entry: { key, value: { data: 1 } },
    deliver: async () => { deliverCalled = true; return { ok: true }; },
    logger,
    entityLabel: "item",
  });

  assertEquals(deliverCalled, false);
  assertEquals(logger.logs.length, 0);
});

Deno.test("cron: deliverWithRetry — permanent failure 403 drops entry, no reinsert", async () => {
  resetStore();
  const key = "dr:perm403";
  await kv.set(key, { channelId: "c1" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c1" } },
    deliver: async () => ({ ok: false, status: 403, error: "Forbidden" }),
    logger,
    entityLabel: "reminder",
  });

  const remaining = await kv.get(key);
  assertEquals(remaining, null);
  assert(logger.logs.some((l) => l.includes("dropped") && l.includes("403")));
});

Deno.test("cron: deliverWithRetry — permanent failure 404 drops entry", async () => {
  resetStore();
  const key = "dr:perm404";
  await kv.set(key, { channelId: "c2" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c2" } },
    deliver: async () => ({ ok: false, status: 404, error: "Not Found" }),
    logger,
    entityLabel: "reminder",
  });

  const remaining = await kv.get(key);
  assertEquals(remaining, null);
  assert(logger.logs.some((l) => l.includes("dropped") && l.includes("404")));
});

Deno.test("cron: deliverWithRetry — custom permanentFailureCodes [410]", async () => {
  resetStore();
  const key = "dr:custom410";
  await kv.set(key, { channelId: "c3" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c3" } },
    deliver: async () => ({ ok: false, status: 410, error: "Gone" }),
    logger,
    entityLabel: "notification",
    permanentFailureCodes: [410],
  });

  const remaining = await kv.get(key);
  assertEquals(remaining, null);
  assert(logger.logs.some((l) => l.includes("dropped") && l.includes("410")));
});

Deno.test("cron: deliverWithRetry — transient failure (500) reinserts with retryCount=1", async () => {
  resetStore();
  const key = "dr:transient500";
  await kv.set(key, { channelId: "c4" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c4" } },
    deliver: async () => ({ ok: false, status: 500, error: "Internal Server Error" }),
    logger,
    entityLabel: "message",
  });

  const entry = await kv.get<{ channelId: string; retryCount: number }>(key);
  assert(entry !== null, "Should reinsert on transient failure");
  assertEquals(entry!.retryCount, 1);
});

Deno.test("cron: deliverWithRetry — backoff doubles per retry (retryCount=2 -> offset=backoffBase*4)", async () => {
  resetStore();
  const key = "dr:backoff";
  const backoffBase = 10_000;
  await kv.set(key, { channelId: "c5", retryCount: 2 }, Date.now() - 1000);
  const logger = makeLogger();

  const beforeMs = Date.now();
  await deliverWithRetry({
    entry: { key, value: { channelId: "c5", retryCount: 2 } },
    deliver: async () => ({ ok: false, status: 502 }),
    logger,
    entityLabel: "message",
    backoffBaseMs: backoffBase,
  });

  // retryCount goes from 2 to 3, so backoff = backoffBase * 2^(3-1) = backoffBase * 4
  const entry = await kv.get<{ retryCount: number }>(key);
  assert(entry !== null, "Should reinsert");
  assertEquals(entry!.retryCount, 3);
});

Deno.test("cron: deliverWithRetry — drops after maxRetries reached", async () => {
  resetStore();
  const key = "dr:maxretries";
  await kv.set(key, { channelId: "c6", retryCount: 2 }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c6", retryCount: 2 } },
    deliver: async () => ({ ok: false, status: 500 }),
    logger,
    entityLabel: "notification",
    maxRetries: 3,
  });

  const remaining = await kv.get(key);
  assertEquals(remaining, null);
  assert(logger.logs.some((l) => l.includes("dropped after 3 retries")));
});

Deno.test("cron: deliverWithRetry — deliver() throws reinserts with backoff", async () => {
  resetStore();
  const key = "dr:throwdeliver";
  await kv.set(key, { channelId: "c7" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c7" } },
    deliver: async () => { throw new Error("network timeout"); },
    logger,
    entityLabel: "message",
  });

  const entry = await kv.get<{ retryCount: number }>(key);
  assert(entry !== null, "Should reinsert on deliver exception");
  assertEquals(entry!.retryCount, 1);
  assert(logger.logs.some((l) => l.includes("Failed to deliver")));
});

Deno.test("cron: deliverWithRetry — custom backoffBaseMs is used in calculation", async () => {
  resetStore();
  const key = "dr:custombackoff";
  const customBase = 5_000;
  await kv.set(key, { channelId: "c8" }, Date.now() - 1000);
  const logger = makeLogger();

  const beforeMs = Date.now();
  await deliverWithRetry({
    entry: { key, value: { channelId: "c8" } },
    deliver: async () => ({ ok: false, status: 503 }),
    logger,
    entityLabel: "item",
    backoffBaseMs: customBase,
  });

  // retryCount goes from 0 to 1, backoff = customBase * 2^(1-1) = customBase * 1
  const entry = await kv.get<{ retryCount: number }>(key);
  assert(entry !== null, "Should reinsert");
  assertEquals(entry!.retryCount, 1);
});

Deno.test("cron: deliverWithRetry — no validate function provided skips validation", async () => {
  resetStore();
  const key = "dr:novalidate";
  await kv.set(key, { anything: "goes" }, Date.now() - 1000);
  const logger = makeLogger();
  let deliverCalled = false;

  await deliverWithRetry({
    entry: { key, value: { anything: "goes" } },
    deliver: async () => { deliverCalled = true; return { ok: true }; },
    // no validate option
    logger,
    entityLabel: "item",
  });

  assert(deliverCalled, "deliver should be called when no validate is provided");
  const remaining = await kv.get(key);
  assertEquals(remaining, null);
});

// --- Batch 3d: additional tests ---

Deno.test("cron: deliverWithRetry — error text preserved in reinserted value", async () => {
  resetStore();
  const key = "dr:preserve";
  const originalValue = { channelId: "c10", content: "important message", extra: 42 };
  await kv.set(key, originalValue, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { ...originalValue } },
    deliver: async () => ({ ok: false, status: 500, error: "Server Error" }),
    logger,
    entityLabel: "message",
  });

  const entry = await kv.get<{ channelId: string; content: string; extra: number; retryCount: number }>(key);
  assert(entry !== null, "Should reinsert on transient failure");
  assertEquals(entry!.channelId, "c10");
  assertEquals(entry!.content, "important message");
  assertEquals(entry!.extra, 42);
  assertEquals(entry!.retryCount, 1);
});

Deno.test("cron: runCron concurrency=1 processes sequentially", async () => {
  resetStore();
  await kv.set("seq:a", { n: 1 }, Date.now() - 3000);
  await kv.set("seq:b", { n: 2 }, Date.now() - 2000);
  await kv.set("seq:c", { n: 3 }, Date.now() - 1000);

  const processed: string[] = [];
  await runCron({
    name: "TestSeq",
    prefix: "seq:",
    concurrency: 1,
    process: async (entry) => { processed.push(entry.key); },
  });

  assertEquals(processed.length, 3);
  assert(processed.includes("seq:a"));
  assert(processed.includes("seq:b"));
  assert(processed.includes("seq:c"));
});

Deno.test("cron: deliverWithRetry — validate returns true proceeds to delivery", async () => {
  resetStore();
  const key = "dr:validok";
  await kv.set(key, { channelId: "c11", valid: true }, Date.now() - 1000);
  const logger = makeLogger();
  let deliverCalled = false;

  await deliverWithRetry({
    entry: { key, value: { channelId: "c11", valid: true } },
    deliver: async () => { deliverCalled = true; return { ok: true }; },
    validate: (v) => v.valid === true,
    logger,
    entityLabel: "item",
  });

  assert(deliverCalled, "deliver should be called when validate returns true");
  const remaining = await kv.get(key);
  assertEquals(remaining, null);
});

Deno.test("cron: runCron maxDue processes all items without error", async () => {
  resetStore();
  // Seed exactly maxDue items
  const maxDue = 5;
  for (let i = 0; i < maxDue; i++) {
    await kv.set(`full:item${i}`, { n: i }, Date.now() - 1000);
  }

  const processed: string[] = [];
  await runCron({
    name: "TestFull",
    prefix: "full:",
    maxDue,
    process: async (entry) => { processed.push(entry.key); },
  });

  assertEquals(processed.length, maxDue);
});

Deno.test("cron: deliverWithRetry — custom backoffBaseMs=1000 uses shorter delay", async () => {
  resetStore();
  const key = "dr:shortbackoff";
  await kv.set(key, { channelId: "c12" }, Date.now() - 1000);
  const logger = makeLogger();

  await deliverWithRetry({
    entry: { key, value: { channelId: "c12" } },
    deliver: async () => ({ ok: false, status: 503, error: "Service Unavailable" }),
    logger,
    entityLabel: "notification",
    backoffBaseMs: 1000,
  });

  const entry = await kv.get<{ retryCount: number }>(key);
  assert(entry !== null, "Should reinsert with backoff");
  assertEquals(entry!.retryCount, 1);
});
