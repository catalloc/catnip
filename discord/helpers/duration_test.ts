import { assertEquals } from "@std/assert";
import { parseDuration } from "./duration.ts";

Deno.test("parseDuration: seconds", () => {
  assertEquals(parseDuration("10s"), 10_000);
});

Deno.test("parseDuration: minutes", () => {
  assertEquals(parseDuration("5m"), 300_000);
});

Deno.test("parseDuration: hours", () => {
  assertEquals(parseDuration("2h"), 7_200_000);
});

Deno.test("parseDuration: days", () => {
  assertEquals(parseDuration("1d"), 86_400_000);
});

Deno.test("parseDuration: combination h+m", () => {
  assertEquals(parseDuration("1h30m"), 5_400_000);
});

Deno.test("parseDuration: full combo d+h+m+s", () => {
  const expected = 86_400_000 + 43_200_000 + 1_800_000 + 15_000;
  assertEquals(parseDuration("1d12h30m15s"), expected);
});

Deno.test("parseDuration: invalid string returns null", () => {
  assertEquals(parseDuration("bad"), null);
});

Deno.test("parseDuration: empty string returns null", () => {
  assertEquals(parseDuration(""), null);
});

Deno.test("parseDuration: exceeds 30d max returns null", () => {
  assertEquals(parseDuration("31d"), null);
});

Deno.test("parseDuration: zero value returns null", () => {
  assertEquals(parseDuration("0s"), null);
  assertEquals(parseDuration("0m"), null);
});

Deno.test("parseDuration: exactly 30d succeeds", () => {
  assertEquals(parseDuration("30d"), 30 * 86_400_000);
});

Deno.test("parseDuration: case-insensitive units", () => {
  assertEquals(parseDuration("10S"), 10_000);
  assertEquals(parseDuration("5M"), 300_000);
  assertEquals(parseDuration("2H"), 7_200_000);
  assertEquals(parseDuration("1D"), 86_400_000);
});

Deno.test("parseDuration: whitespace between value and unit", () => {
  assertEquals(parseDuration("1 h 30 m"), 5_400_000);
});
