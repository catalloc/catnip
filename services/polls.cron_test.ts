import "../test/_mocks/env.ts";
import { assertEquals, assert } from "../test/assert.ts";
import { sqlite } from "../test/_mocks/sqlite.ts";
import { kv } from "../discord/persistence/kv.ts";
import { mockFetch, restoreFetch } from "../test/_mocks/fetch.ts";
import type { PollConfig } from "../discord/interactions/commands/poll.ts";
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

Deno.test("polls cron: skips malformed entries", async () => {
  resetStore();
  const key = "poll:g1";
  // Missing channelId and messageId
  await kv.set(key, { question: "Bad", options: [], votes: {}, ended: false, endsAt: 0, createdBy: "u" }, Date.now() - 1000);
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    await runCron();
    // Malformed entry is skipped — still in KV
    const remaining = await kv.get(key);
    assert(remaining !== null, "Malformed poll should not be deleted");
  } finally {
    restoreFetch();
  }
});
