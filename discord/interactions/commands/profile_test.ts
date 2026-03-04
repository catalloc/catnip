import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../games/accounts.ts";
import { xp } from "../../games/xp.ts";
import { profile } from "../../games/profile.ts";
import command from "./profile.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("profile: shows basic profile for new user", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
  assert(result.embed.description?.includes("Level 0"));
});

Deno.test("profile: shows level and XP bar", async () => {
  resetStore();
  await xp.grantXp(guildId, userId, 150);
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed?.description?.includes("Level 1"));
  assert(result.embed?.description?.includes("XP"));
});

Deno.test("profile: shows custom title", async () => {
  resetStore();
  await profile.setTitle(guildId, userId, "The Grinder");
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assert(result.embed?.description?.includes("The Grinder"));
});

Deno.test("profile: shows balance field", async () => {
  resetStore();
  await accounts.creditBalance(guildId, userId, 5000);
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  const balField = result.embed?.fields?.find((f: any) => f.name === "Balance");
  assert(balField?.value?.includes("5,000"));
});

Deno.test("profile: uses custom border color", async () => {
  resetStore();
  await profile.setBorderColor(guildId, userId, 0xFFD700);
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  assertEquals(result.embed?.color, 0xFFD700);
});

Deno.test("profile: shows badges", async () => {
  resetStore();
  await profile.addBadge(guildId, userId, ":star:");
  await profile.addBadge(guildId, userId, ":crown:");
  const result = await command.execute({
    guildId, userId, options: {}, config: {},
  } as any);
  const badgeField = result.embed?.fields?.find((f: any) => f.name === "Badges");
  assert(badgeField?.value?.includes(":star:"));
  assert(badgeField?.value?.includes(":crown:"));
});

Deno.test("profile: can view another user", async () => {
  resetStore();
  await accounts.creditBalance(guildId, "u2", 3000);
  const result = await command.execute({
    guildId, userId, options: { user: "u2" }, config: {},
  } as any);
  assertEquals(result.success, true);
  assert(result.embed);
});
