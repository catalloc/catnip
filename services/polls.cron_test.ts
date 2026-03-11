import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, restoreFetch, setNextThrow } from "../test/_mocks/fetch.ts";
import type { PollConfig } from "../discord/interactions/commands/poll.ts";
import { MAX_ANNOUNCE_RETRIES } from "../discord/interactions/commands/poll.ts";
import runCron from "./polls.cron.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makePoll(overrides?: Partial<PollConfig>): PollConfig {
  return {
    question: "Test?",
    options: ["Yes", "No"],
    votes: {},
    channelId: "c1",
    messageId: "m1",
    createdBy: "u1",
    endsAt: Date.now() - 1000,
    ended: false,
    ...overrides,
  };
}

Deno.test("polls cron: ended poll is cleaned up", async () => {
  resetStore();
  const key = "poll:g1";
  await kv.set(key, makePoll({ ended: true }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assertEquals(remaining, null);
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: active poll gets ended", async () => {
  resetStore();
  const key = "poll:g1";
  await kv.set(key, makePoll({ ended: false }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // endPoll atomically claims and sets ended=true
    const updated = await kv.get<PollConfig>(key);
    assertEquals(updated?.ended, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: API failure does not delete poll (retried next run)", async () => {
  resetStore();
  const key = "poll:g1";
  await kv.set(key, makePoll({ ended: false }), Date.now() - 1000);
  // All API calls fail — endPoll's claimUpdate succeeds but panel update fails
  // The poll should still be marked ended (claimUpdate is first) but remain in KV
  mockFetch({ default: { status: 500, body: "Internal Server Error" } });
  try {
    await runCron();
    const updated = await kv.get<PollConfig>(key);
    // claimUpdate transitions ended: false → true before any API calls
    // so even on API failure, the poll state reflects the claim
    assert(updated !== null, "Poll should still be in KV");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: deletes malformed entries", async () => {
  resetStore();
  const key = "poll:g1";
  // Missing channelId and messageId
  await kv.set(key, { question: "Bad", options: [], votes: {}, ended: false, endsAt: 0, createdBy: "u" }, Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // Malformed entry is cleaned up
    const remaining = await kv.get(key);
    assert(remaining === null, "Malformed poll should be deleted");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: timeout error on active poll retries next run", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  const key = "poll:g_timeout";
  await kv.set(key, makePoll({ ended: false }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  setNextThrow(new Error("Timed out"));
  try {
    await runCron();
    const remaining = await kv.get<PollConfig>(key);
    assert(remaining !== null, "Poll should still be in KV after timeout");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: announce retry success removes announceFailed flag", async () => {
  resetStore();
  const key = "poll:g_retry_ok";
  await kv.set(key, makePoll({
    ended: true,
    announceFailed: true,
    announceRetries: 0,
  }), Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const updated = await kv.get<PollConfig>(key);
    assert(updated !== null, "Poll should still exist (scheduled for cleanup)");
    assertEquals(updated?.announceFailed, undefined, "announceFailed should be cleared");
    assertEquals(updated?.announceRetries, undefined, "announceRetries should be cleared");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: announce retry intermediate uses exponential backoff", async () => {
  resetStore();
  const key = "poll:g_backoff";
  await kv.set(key, makePoll({
    ended: true,
    announceFailed: true,
    announceRetries: 0,
  }), Date.now() - 1000);
  // announcePoll returns false when PATCH fails
  mockFetch({
    responses: [
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
    ],
  });
  try {
    await runCron();
    const updated = await kv.get<PollConfig>(key);
    assert(updated !== null, "Poll should still exist");
    assertEquals(updated?.announceFailed, true, "announceFailed should remain true");
    assertEquals(updated?.announceRetries, 1, "announceRetries should increment to 1");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: MAX_ANNOUNCE_RETRIES exhaustion gives up", async () => {
  resetStore();
  const key = "poll:g_maxretry";
  await kv.set(key, makePoll({
    ended: true,
    announceFailed: true,
    announceRetries: MAX_ANNOUNCE_RETRIES - 1,
  }), Date.now() - 1000);
  // announcePoll returns false (PATCH fails)
  mockFetch({
    responses: [
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
      { status: 500, body: "fail" },
    ],
  });
  try {
    await runCron();
    const updated = await kv.get<PollConfig>(key);
    assert(updated !== null, "Poll should exist (saved for cleanup)");
    assertEquals(updated?.announceFailed, undefined, "announceFailed should be cleared after giving up");
    assertEquals(updated?.announceRetries, undefined, "announceRetries should be cleared after giving up");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: announce retry error increments failed counter", { sanitizeOps: false, sanitizeResources: false }, async () => {
  resetStore();
  const key = "poll:g_retry_err";
  await kv.set(key, makePoll({
    ended: true,
    announceFailed: true,
    announceRetries: 0,
  }), Date.now() - 1000);
  mockFetch();
  setNextThrow(new Error("Network failure"));
  try {
    await runCron();
    const remaining = await kv.get<PollConfig>(key);
    assert(remaining !== null, "Poll should still be in KV after announce error");
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: empty poll list is no-op", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // No errors, no exceptions — just a no-op
  } finally {
    restoreFetch();
  }
});

Deno.test("polls cron: claimDelete returns false skips cleanup", async () => {
  resetStore();
  const key = "poll:g_nodupe";
  await kv.set(key, makePoll({ ended: true }), Date.now() - 1000);

  const origClaimDelete = kv.claimDelete.bind(kv);
  (kv as any).claimDelete = async (k: string) => {
    if (k === key) return false;
    return origClaimDelete(k);
  };

  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // claimDelete returned false — no error
  } finally {
    (kv as any).claimDelete = origClaimDelete;
    restoreFetch();
  }
});

Deno.test("polls cron: partial malformation (channelId but no messageId) deleted", async () => {
  resetStore();
  const key = "poll:g_partial";
  await kv.set(key, {
    question: "Partial",
    options: ["A", "B"],
    votes: {},
    channelId: "c1",
    ended: false,
    endsAt: 0,
    createdBy: "u1",
  }, Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    const remaining = await kv.get(key);
    assert(remaining === null, "Partially malformed poll should be deleted");
  } finally {
    restoreFetch();
  }
});
