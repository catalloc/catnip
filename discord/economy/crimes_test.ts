import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { crimes, getCrimeDefinition, rollCrime, CRIME_DEFINITIONS, _internals } from "./crimes.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("crimes _internals.crimeKey: correct format", () => {
  assertEquals(_internals.crimeKey("g1", "u1"), "crime:g1:u1");
});

Deno.test("getCrimeDefinition: returns correct crime", () => {
  const crime = getCrimeDefinition("pickpocket");
  assertEquals(crime?.name, "Pickpocket");
  assertEquals(crime?.successRate, 80);
});

Deno.test("getCrimeDefinition: undefined for unknown", () => {
  assertEquals(getCrimeDefinition("fake" as any), undefined);
});

Deno.test("rollCrime: returns valid outcome", () => {
  const crime = CRIME_DEFINITIONS[0]; // pickpocket
  const outcome = rollCrime(crime);
  assertEquals(outcome.crime.id, "pickpocket");
  if (outcome.success) {
    assert(outcome.amount >= crime.rewardMin && outcome.amount <= crime.rewardMax);
  } else {
    assert(outcome.amount >= crime.fineMin && outcome.amount <= crime.fineMax);
  }
});

Deno.test("CRIME_DEFINITIONS: has 5 crimes", () => {
  assertEquals(CRIME_DEFINITIONS.length, 5);
});

Deno.test("crimes getCooldownRemaining: zero for new user", async () => {
  resetStore();
  const remaining = await crimes.getCooldownRemaining("g1", "u1");
  assertEquals(remaining, 0);
});

Deno.test("crimes recordAttempt: records and sets cooldown", async () => {
  resetStore();
  const now = 1000000;
  await crimes.recordAttempt("g1", "u1", true, 30 * 60_000, now);
  const state = await crimes.getState("g1", "u1");
  assertEquals(state?.totalAttempts, 1);
  assertEquals(state?.totalSuccesses, 1);
  assertEquals(state?.lastCrimeAt, now);
  assertEquals(state?.nextCrimeAt, now + 30 * 60_000);
});

Deno.test("crimes getCooldownRemaining: reports remaining time", async () => {
  resetStore();
  const now = 1000000;
  await crimes.recordAttempt("g1", "u1", true, 30 * 60_000, now);
  const remaining = await crimes.getCooldownRemaining("g1", "u1", now + 10 * 60_000);
  assertEquals(remaining, 20 * 60_000);
});

Deno.test("crimes getCooldownRemaining: zero when expired", async () => {
  resetStore();
  const now = 1000000;
  await crimes.recordAttempt("g1", "u1", true, 30 * 60_000, now);
  const remaining = await crimes.getCooldownRemaining("g1", "u1", now + 31 * 60_000);
  assertEquals(remaining, 0);
});

Deno.test("crimes recordAttempt: increments counters", async () => {
  resetStore();
  await crimes.recordAttempt("g1", "u1", true, 1000);
  await crimes.recordAttempt("g1", "u1", false, 1000);
  await crimes.recordAttempt("g1", "u1", true, 1000);
  const state = await crimes.getState("g1", "u1");
  assertEquals(state?.totalAttempts, 3);
  assertEquals(state?.totalSuccesses, 2);
});
