import "../../../test/_mocks/env.ts";
import { assert, assertEquals } from "../../../test/assert.ts";
import { pollKey, buildPollComponents, buildPollEmbed } from "./poll.ts";
import type { PollConfig } from "./poll.ts";
import { EmbedColors } from "../../constants.ts";

Deno.test("pollKey: formats correctly", () => {
  assertEquals(pollKey("guild123"), "poll:guild123");
});

Deno.test("buildPollComponents: creates buttons for options", () => {
  const rows = buildPollComponents("g1", ["Yes", "No", "Maybe"]);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].components.length, 3);
  assertEquals(rows[0].components[0].custom_id, "poll-vote:g1:0");
  assertEquals(rows[0].components[1].label, "No");
});

Deno.test("buildPollComponents: ended returns empty array", () => {
  assertEquals(buildPollComponents("g1", ["A", "B"], true), []);
});

Deno.test("buildPollEmbed: active poll", () => {
  const config: PollConfig = {
    question: "Favorite color?",
    options: ["Red", "Blue"],
    votes: { user1: 0, user2: 1, user3: 0 },
    channelId: "c1",
    messageId: "m1",
    createdBy: "u1",
    endsAt: Date.now() + 86400000,
    ended: false,
  };
  const embed = buildPollEmbed(config);
  assertEquals(embed.title, "\u{1F4CA} Favorite color?");
  assertEquals(embed.color, EmbedColors.INFO);
  assert(embed.description!.includes("Total votes: 3"));
});

Deno.test("buildPollComponents: splits into rows of 5 max", () => {
  const opts = Array.from({ length: 8 }, (_, i) => `Option ${i}`);
  const rows = buildPollComponents("g1", opts);
  assertEquals(rows.length, 2);
  assertEquals(rows[0].components.length, 5);
  assertEquals(rows[1].components.length, 3);
});

Deno.test("buildPollEmbed: zero votes", () => {
  const config: PollConfig = {
    question: "Empty poll",
    options: ["A", "B"],
    votes: {},
    channelId: "c1",
    messageId: "m1",
    createdBy: "u1",
    endsAt: Date.now() + 86400000,
    ended: false,
  };
  const embed = buildPollEmbed(config);
  assert(embed.description!.includes("Total votes: 0"));
});

Deno.test("buildPollEmbed: with endsAt shows time text", () => {
  const endsAt = Date.now() + 3_600_000;
  const config: PollConfig = {
    question: "Timed poll",
    options: ["A", "B"],
    votes: {},
    channelId: "c1",
    messageId: "m1",
    createdBy: "u1",
    endsAt,
    ended: false,
  };
  const embed = buildPollEmbed(config);
  assert(embed.description!.includes("Ends <t:"));
});

Deno.test("buildPollEmbed: ended poll shows results", () => {
  const config: PollConfig = {
    question: "Pick one",
    options: ["A", "B"],
    votes: { u1: 0 },
    channelId: "c1",
    messageId: "m1",
    createdBy: "u1",
    endsAt: Date.now() + 86400000,
    ended: false,
  };
  const embed = buildPollEmbed(config, true);
  assertEquals(embed.title, "\u{1F4CA} Poll Results");
  assertEquals(embed.color, EmbedColors.WARNING);
  assert(embed.description!.includes("Pick one"));
});

// --- Poll command execution tests ---

import "../../../test/_mocks/sqlite.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { kv } from "../../persistence/kv.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import pollCommand from "./poll.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("poll create: duplicate options rejected", async () => {
  resetStore();
  mockFetch({ default: { status: 200, body: { id: "msg1" } } });
  try {
    const result = await pollCommand.execute({
      guildId: "g_poll",
      userId: "u1",
      options: { subcommand: "create", question: "Q", options: "A,B,a", channel: "c1" },
      config: {},
    });
    assertEquals(result.success, false);
    assert(result.error?.includes("Duplicate"));
  } finally {
    restoreFetch();
  }
});

Deno.test("poll create: empty options (all whitespace) rejected", async () => {
  resetStore();
  const result = await pollCommand.execute({
    guildId: "g_poll",
    userId: "u1",
    options: { subcommand: "create", question: "Q", options: " , , ", channel: "c1" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("at least 2"));
});

Deno.test("poll end: no active poll returns error", async () => {
  resetStore();
  const result = await pollCommand.execute({
    guildId: "g_no_poll",
    userId: "u1",
    options: { subcommand: "end" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("No active poll"));
});

Deno.test("poll: unknown subcommand returns error", async () => {
  resetStore();
  const result = await pollCommand.execute({
    guildId: "g1",
    userId: "u1",
    options: { subcommand: "invalid" },
    config: {},
  });
  assertEquals(result.success, false);
  assert(result.error?.includes("subcommand"));
});
