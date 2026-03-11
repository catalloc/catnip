import { assertEquals } from "../../test/assert.ts";
import { sanitizeMentions } from "./sanitize.ts";

Deno.test("sanitizeMentions: strips @everyone", () => {
  assertEquals(sanitizeMentions("hello @everyone"), "hello @\u200Beveryone");
});

Deno.test("sanitizeMentions: strips @here case-insensitive", () => {
  assertEquals(sanitizeMentions("@HERE test @Everyone"), "@\u200BHERE test @\u200BEveryone");
});

Deno.test("sanitizeMentions: replaces user and role mentions", () => {
  assertEquals(sanitizeMentions("<@!123> and <@&456>"), "[mention removed] and [mention removed]");
});

Deno.test("sanitizeMentions: passes clean text unchanged", () => {
  assertEquals(sanitizeMentions("hello world"), "hello world");
});

Deno.test("sanitizeMentions: handles empty string", () => {
  assertEquals(sanitizeMentions(""), "");
});

Deno.test("sanitizeMentions: handles mixed mentions in one string", () => {
  const input = "Hey @everyone check <@!999> and <@&888> @here now";
  const result = sanitizeMentions(input);
  assertEquals(result.includes("@everyone"), false);
  assertEquals(result.includes("@here"), false);
  assertEquals(result.includes("<@!999>"), false);
  assertEquals(result.includes("<@&888>"), false);
  assertEquals(result.includes("[mention removed]"), true);
  assertEquals(result.includes("@\u200Beveryone"), true);
  assertEquals(result.includes("@\u200Bhere"), true);
});

// --- Security edge case tests ---

Deno.test("sanitize: nested mentions are all replaced", () => {
  const input = "Hello @everyone and <@123> are here";
  const result = sanitizeMentions(input);
  assertEquals(result.includes("@everyone"), false);
  assertEquals(result.includes("<@123>"), false);
  assertEquals(result.includes("@\u200Beveryone"), true);
  assertEquals(result.includes("[mention removed]"), true);
});

Deno.test("sanitize: numeric mention <@123456789> replaced", () => {
  const result = sanitizeMentions("Ping <@123456789> now");
  assertEquals(result.includes("<@123456789>"), false);
  assertEquals(result, "Ping [mention removed] now");
});

Deno.test("sanitize: multiple mentions in single string all replaced", () => {
  const input = "Users <@123> and <@456> and <@789> are mentioned";
  const result = sanitizeMentions(input);
  assertEquals(result.includes("<@123>"), false);
  assertEquals(result.includes("<@456>"), false);
  assertEquals(result.includes("<@789>"), false);
  // All three should be replaced
  const count = (result.match(/\[mention removed\]/g) || []).length;
  assertEquals(count, 3);
});

Deno.test("sanitize: role mention <@&789> replaced", () => {
  const result = sanitizeMentions("Role <@&789> pinged");
  assertEquals(result.includes("<@&789>"), false);
  assertEquals(result, "Role [mention removed] pinged");
});
