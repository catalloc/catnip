import "../../../test/_mocks/env.ts";
import { assert, assertEquals } from "@std/assert";
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
    endsAt: null,
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
    endsAt: null,
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
    endsAt: null,
    ended: false,
  };
  const embed = buildPollEmbed(config, true);
  assertEquals(embed.title, "\u{1F4CA} Poll Results");
  assertEquals(embed.color, EmbedColors.WARNING);
  assert(embed.description!.includes("Pick one"));
});
