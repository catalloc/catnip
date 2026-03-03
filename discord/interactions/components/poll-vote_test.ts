import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "@std/assert";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import pollVote from "./poll-vote.ts";
import { type PollConfig, pollKey } from "../commands/poll.ts";

function resetStore() {
  (sqlite as any)._reset();
}

function makePoll(overrides?: Partial<PollConfig>): PollConfig {
  return {
    question: "Favorite color?",
    options: ["Red", "Blue", "Green"],
    votes: {},
    channelId: "ch1",
    messageId: "msg1",
    createdBy: "admin1",
    endsAt: Date.now() + 60_000,
    ended: false,
    ...overrides,
  };
}

function makeCtx(guildId = "g1", userId = "u1", optionIndex = 0) {
  return {
    customId: `poll-vote:${guildId}:${optionIndex}`,
    guildId,
    userId,
    interaction: {},
  };
}

Deno.test("poll-vote: returns error when poll not found", async () => {
  resetStore();
  const result = await pollVote.execute(makeCtx());
  assertEquals(result.success, false);
  assertEquals(result.error, "This poll has ended.");
});

Deno.test("poll-vote: returns error when poll ended", async () => {
  resetStore();
  await kv.set(pollKey("g1"), makePoll({ ended: true }));
  const result = await pollVote.execute(makeCtx());
  assertEquals(result.success, false);
  assertEquals(result.error, "This poll has ended.");
});

Deno.test("poll-vote: successfully casts vote", async () => {
  resetStore();
  await kv.set(pollKey("g1"), makePoll());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await pollVote.execute(makeCtx("g1", "u1", 1));
    assertEquals(result.success, true);
    assert(result.message!.includes("Blue"));

    // Verify vote was recorded
    const poll = await kv.get<PollConfig>(pollKey("g1"));
    assertEquals(poll!.votes["u1"], 1);
  } finally {
    restoreFetch();
  }
});

Deno.test("poll-vote: removes vote on same option", async () => {
  resetStore();
  await kv.set(pollKey("g1"), makePoll({ votes: { u1: 0 } }));
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await pollVote.execute(makeCtx("g1", "u1", 0));
    assertEquals(result.success, true);
    assert(result.message!.includes("removed"));

    const poll = await kv.get<PollConfig>(pollKey("g1"));
    assertEquals(poll!.votes["u1"], undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test("poll-vote: switches vote to different option", async () => {
  resetStore();
  await kv.set(pollKey("g1"), makePoll({ votes: { u1: 0 } }));
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await pollVote.execute(makeCtx("g1", "u1", 2));
    assertEquals(result.success, true);
    assert(result.message!.includes("changed") || result.message!.includes("Green"));

    const poll = await kv.get<PollConfig>(pollKey("g1"));
    assertEquals(poll!.votes["u1"], 2);
  } finally {
    restoreFetch();
  }
});

Deno.test("poll-vote: rejects invalid customId format", async () => {
  resetStore();
  await kv.set(pollKey("g1"), makePoll());
  const result = await pollVote.execute({
    customId: "poll-vote:g1", // missing option index
    guildId: "g1",
    userId: "u1",
    interaction: {},
  });
  assertEquals(result.success, false);
  assert(result.error!.includes("Invalid"));
});

Deno.test("poll-vote: rejects out-of-bounds option", async () => {
  resetStore();
  await kv.set(pollKey("g1"), makePoll());
  mockFetch({ default: { status: 200, body: {} } });
  try {
    const result = await pollVote.execute(makeCtx("g1", "u1", 99));
    assertEquals(result.success, false);
    assert(result.error!.includes("Invalid"));
  } finally {
    restoreFetch();
  }
});

Deno.test("poll-vote: component metadata is correct", () => {
  assertEquals(pollVote.customId, "poll-vote:");
  assertEquals(pollVote.match, "prefix");
  assertEquals(pollVote.type, "button");
});
