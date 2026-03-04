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

Deno.test("job status: shows unemployed by default", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "status" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.fields?.some((f: any) => f.value === "Unemployed"));
});

Deno.test("job status: shows correct tier after upgrade", async () => {
  resetStore();
  await jobs.getOrCreate(guildId, userId);
  await jobs.setTier(guildId, userId, "chef");
  const result = await command.execute({ guildId, userId, options: { subcommand: "status" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed?.fields?.some((f: any) => f.value === "Chef"));
});

Deno.test("job collect: fails when unemployed", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "collect" }, config: {} } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("unemployed"));
});

Deno.test("job collect: fails when no hours elapsed", async () => {
  resetStore();
  await jobs.getOrCreate(guildId, userId);
  await jobs.setTier(guildId, userId, "burger-flipper");
  // Collect immediately — no time has passed
  const result = await command.execute({ guildId, userId, options: { subcommand: "collect" }, config: {} } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("No earnings"));
});

Deno.test("job info: shows all tiers", async () => {
  resetStore();
  const result = await command.execute({ guildId, userId, options: { subcommand: "info" }, config: {} } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  const desc = result.embed.description ?? "";
  assert(desc.includes("Unemployed"));
  assert(desc.includes("Mafia Boss"));
  assert(desc.includes("500"));
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
