import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { jobs } from "../../economy/jobs.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import command from "./job.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("job status: no active shift", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "status" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No active shift"));
});

Deno.test("job start: fails when unemployed", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "start" }, config: {} } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("unemployed"));
});

Deno.test("job start: begins shift when employed", async () => {
  resetStore();
  await jobs.getOrCreate(guildId, userId);
  await jobs.setTier(guildId, userId, "burger-flipper");
  const result = await command.execute({ guildId, userId, options: { subcommand: "start" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Burger Flipper"));
});

Deno.test("job collect: fails when no shift active", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "collect" }, config: {} } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("don't have"));
});

Deno.test("job info: shows tiers with shift payouts", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "info" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  const desc = result.embed.description ?? "";
  assert(desc.includes("Burger Flipper"));
  assert(desc.includes("Mafia Boss"));
  assert(desc.includes("1,000"));
});

Deno.test("job: rejects invalid subcommand", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "invalid" }, config: {} } as any);
  assertEquals(result.success, false);
});

Deno.test("job: disabled when jobs are off", async () => {
  resetStore();
  await economyConfig.update(guildId, { jobsEnabled: false });
  const result = await command.execute({ guildId, userId, options: { subcommand: "status" }, config: {} } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("disabled"));
});
