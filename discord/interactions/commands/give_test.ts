import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { accounts } from "../../economy/accounts.ts";
import command from "./give.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "admin1";

Deno.test("give: grants coins", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId,
    options: { user: "u1", amount: 100, reason: "test" },
    config: {},
    memberRoles: [],
    memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("100"));
  const account = await accounts.getAccount(guildId, "u1");
  assertEquals(account?.balance, 100);
});

Deno.test("give: deducts coins", async () => {
  resetStore();
  await accounts.creditBalance(guildId, "u1", 200);
  const result = await command.execute({
    guildId, userId,
    options: { user: "u1", amount: -50 },
    config: {},
    memberRoles: [],
    memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("50"));
  const account = await accounts.getAccount(guildId, "u1");
  assertEquals(account?.balance, 150);
});

Deno.test("give: fails to deduct more than balance", async () => {
  resetStore();
  await accounts.creditBalance(guildId, "u1", 10);
  const result = await command.execute({
    guildId, userId,
    options: { user: "u1", amount: -50 },
    config: {},
    memberRoles: [],
    memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
  assert(result.error?.includes("10"));
});

Deno.test("give: rejects zero amount", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId,
    options: { user: "u1", amount: 0 },
    config: {},
    memberRoles: [],
    memberPermissions: "8",
  } as any);
  assertEquals(result.success, false);
});

Deno.test("give: default reason", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId,
    options: { user: "u1", amount: 10 },
    config: {},
    memberRoles: [],
    memberPermissions: "8",
  } as any);
  assertEquals(result.success, true);
  assert(result.message?.includes("No reason provided"));
});
