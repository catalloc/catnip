import "../test/_mocks/env.ts";
import { assertEquals } from "@std/assert";
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
    // endPoll re-reads from KV and sets ended=true
    const updated = await kv.get<PollConfig>(key);
    assertEquals(updated?.ended, true);
  } finally {
    restoreFetch();
  }
});
