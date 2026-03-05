import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { accounts, _internals } from "./accounts.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("accounts _internals.accountKey: correct format", () => {
  assertEquals(_internals.accountKey("g1", "u1"), "economy:g1:u1");
});

Deno.test("accounts getAccount: returns null for non-existent", async () => {
  resetStore();
  const result = await accounts.getAccount("g1", "u1");
  assertEquals(result, null);
});

Deno.test("accounts getOrCreate: creates new account with default balance", async () => {
  resetStore();
  const account = await accounts.getOrCreate("g1", "u1");
  assertEquals(account.userId, "u1");
  assertEquals(account.guildId, "g1");
  assertEquals(account.balance, 0);
  assertEquals(account.lifetimeEarned, 0);
});

Deno.test("accounts getOrCreate: creates with starting balance", async () => {
  resetStore();
  const account = await accounts.getOrCreate("g1", "u1", 100);
  assertEquals(account.balance, 100);
  assertEquals(account.lifetimeEarned, 100);
});

Deno.test("accounts getOrCreate: returns existing account", async () => {
  resetStore();
  const first = await accounts.getOrCreate("g1", "u1", 50);
  const second = await accounts.getOrCreate("g1", "u1", 999);
  assertEquals(second.balance, first.balance);
});

Deno.test("accounts creditBalance: adds coins", async () => {
  resetStore();
  await accounts.getOrCreate("g1", "u1");
  const updated = await accounts.creditBalance("g1", "u1", 100);
  assertEquals(updated.balance, 100);
  assertEquals(updated.lifetimeEarned, 100);
});

Deno.test("accounts creditBalance: creates account if missing", async () => {
  resetStore();
  const updated = await accounts.creditBalance("g1", "u1", 50);
  assertEquals(updated.balance, 50);
  assertEquals(updated.lifetimeEarned, 50);
});

Deno.test("accounts debitBalance: removes coins on success", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 100);
  const { success, account } = await accounts.debitBalance("g1", "u1", 30);
  assertEquals(success, true);
  assertEquals(account.balance, 70);
});

Deno.test("accounts debitBalance: fails on insufficient funds", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 10);
  const { success, account } = await accounts.debitBalance("g1", "u1", 50);
  assertEquals(success, false);
  assertEquals(account.balance, 10);
});

Deno.test("accounts debitBalance: fails on zero balance", async () => {
  resetStore();
  const { success } = await accounts.debitBalance("g1", "u1", 1);
  assertEquals(success, false);
});

Deno.test("accounts setBalance: sets exact value", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 50);
  const updated = await accounts.setBalance("g1", "u1", 200);
  assertEquals(updated.balance, 200);
  assertEquals(updated.lifetimeEarned, 200);
});

Deno.test("accounts setBalance: decrease doesn't add to lifetimeEarned", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 200);
  const updated = await accounts.setBalance("g1", "u1", 50);
  assertEquals(updated.balance, 50);
  assertEquals(updated.lifetimeEarned, 200);
});

Deno.test("accounts listAccounts: returns sorted by balance", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 50);
  await accounts.creditBalance("g1", "u2", 200);
  await accounts.creditBalance("g1", "u3", 100);
  const list = await accounts.listAccounts("g1");
  assertEquals(list.length, 3);
  assertEquals(list[0].userId, "u2");
  assertEquals(list[1].userId, "u3");
  assertEquals(list[2].userId, "u1");
});

Deno.test("accounts listAccounts: empty guild", async () => {
  resetStore();
  const list = await accounts.listAccounts("g1");
  assertEquals(list.length, 0);
});

// --- creditBalance updates lifetimeEarned ---

Deno.test("accounts creditBalance: accumulates lifetimeEarned", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u_lt", 100);
  await accounts.creditBalance("g1", "u_lt", 50);
  const account = await accounts.getAccount("g1", "u_lt");
  assertEquals(account?.balance, 150);
  assertEquals(account?.lifetimeEarned, 150);
});

// --- multiple credits and debits ---

Deno.test("accounts: credit then debit keeps lifetimeEarned", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u_cd", 200);
  await accounts.debitBalance("g1", "u_cd", 50);
  const account = await accounts.getAccount("g1", "u_cd");
  assertEquals(account?.balance, 150);
  assertEquals(account?.lifetimeEarned, 200);
});

Deno.test("accounts creditBalance: 0 amount leaves balance unchanged", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 100);
  const updated = await accounts.creditBalance("g1", "u1", 0);
  assertEquals(updated.balance, 100);
  assertEquals(updated.lifetimeEarned, 100);
});

Deno.test("accounts debitBalance: 0 amount succeeds", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 100);
  const { success, account } = await accounts.debitBalance("g1", "u1", 0);
  assertEquals(success, true);
  assertEquals(account.balance, 100);
});

Deno.test("accounts: multiple credits accumulate lifetimeEarned", async () => {
  resetStore();
  await accounts.creditBalance("g1", "u1", 50);
  await accounts.creditBalance("g1", "u1", 75);
  await accounts.creditBalance("g1", "u1", 25);
  const account = await accounts.getAccount("g1", "u1");
  assertEquals(account!.balance, 150);
  assertEquals(account!.lifetimeEarned, 150);
});
