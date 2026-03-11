import { assertEquals, assert } from "../../test/assert.ts";
import { isSnowflake, assertSnowflake } from "./snowflake.ts";

// --- isSnowflake ---

Deno.test("isSnowflake: valid snowflake IDs", () => {
  assertEquals(isSnowflake("123456789012345678"), true);
  assertEquals(isSnowflake("1"), true);
  assertEquals(isSnowflake("99999999999999999999"), true); // 20 digits
});

Deno.test("isSnowflake: rejects non-numeric strings", () => {
  assertEquals(isSnowflake(""), false);
  assertEquals(isSnowflake("abc"), false);
  assertEquals(isSnowflake("123abc"), false);
  assertEquals(isSnowflake("12 34"), false);
  assertEquals(isSnowflake("-1"), false);
});

Deno.test("isSnowflake: rejects strings longer than 20 digits", () => {
  assertEquals(isSnowflake("123456789012345678901"), false); // 21 digits
});

// --- assertSnowflake ---

Deno.test("assertSnowflake: does not throw for valid snowflake", () => {
  assertSnowflake("123456789012345678");
  assertSnowflake("1", "guildId");
});

Deno.test("assertSnowflake: throws for invalid snowflake", () => {
  let threw = false;
  try {
    assertSnowflake("abc");
  } catch (e) {
    threw = true;
    assert(e instanceof Error);
    assert(e.message.includes("Invalid Discord snowflake"));
    assert(e.message.includes('"abc"'));
  }
  assert(threw, "Expected assertSnowflake to throw");
});

Deno.test("assertSnowflake: includes custom label in error", () => {
  let threw = false;
  try {
    assertSnowflake("bad!", "guildId");
  } catch (e) {
    threw = true;
    assert(e instanceof Error);
    assert(e.message.includes("guildId"));
  }
  assert(threw, "Expected assertSnowflake to throw");
});

Deno.test("snowflake: 17-digit string accepted", () => {
  assertEquals(isSnowflake("12345678901234567"), true);
});

Deno.test("snowflake: 21-digit string rejected", () => {
  assertEquals(isSnowflake("123456789012345678901"), false);
});
