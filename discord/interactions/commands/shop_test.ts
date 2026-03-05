import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert, assertStringIncludes } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";
import { shop } from "../../games/shop.ts";
import { accounts } from "../../games/accounts.ts";
import { xp } from "../../games/xp.ts";
import command from "./shop.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";
const ctx = (sub: string, opts: Record<string, unknown> = {}) =>
  ({ guildId, userId, options: { subcommand: sub, ...opts }, memberRoles: ["admin_role"], memberPermissions: 8 }) as any;

// --- browse ---

Deno.test("shop browse: empty shop message", async () => {
  resetStore();
  const result = await command.execute(ctx("browse"));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "empty");
});

Deno.test("shop browse: populated shop with level requirements", async () => {
  resetStore();
  await shop.addItem(guildId, { name: "Sword", price: 100, description: "A sword", type: "custom", requiredLevel: 5 });
  await shop.addItem(guildId, { name: "Shield", price: 50, description: "A shield", type: "custom" });
  const result = await command.execute(ctx("browse"));
  assertEquals(result.success, true);
  assert(result.embed);
  assertStringIncludes(result.embed!.description!, "Sword");
  assertStringIncludes(result.embed!.description!, "Shield");
  assertStringIncludes(result.embed!.description!, "Lv.5");
});

// --- buy ---

Deno.test("shop buy: invalid item number", async () => {
  resetStore();
  await shop.addItem(guildId, { name: "Item", price: 10, description: "test", type: "custom" });
  const result = await command.execute(ctx("buy", { item: 99 }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Invalid item number");
});

Deno.test("shop buy: level gate rejection", async () => {
  resetStore();
  await shop.addItem(guildId, { name: "Premium", price: 10, description: "high lvl", type: "custom", requiredLevel: 99 });
  await accounts.creditBalance(guildId, userId, 100);
  const result = await command.execute(ctx("buy", { item: 1 }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Level 99");
});

Deno.test("shop buy: successful purchase", async () => {
  resetStore();
  await shop.addItem(guildId, { name: "Cheap", price: 10, description: "cheap item", type: "custom" });
  await accounts.creditBalance(guildId, userId, 100);
  const result = await command.execute(ctx("buy", { item: 1 }));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "Purchased");
  assertStringIncludes(result.message!, "Cheap");
});

// --- add ---

Deno.test("shop add: non-admin rejected", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId,
    options: { subcommand: "add", name: "X", price: 10, description: "d", type: "custom" },
    memberRoles: [], memberPermissions: 0,
  } as any);
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "admin");
});

Deno.test("shop add: price < 1 rejected", async () => {
  resetStore();
  const result = await command.execute(ctx("add", { name: "X", price: 0, description: "d", type: "custom" }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "at least 1");
});

Deno.test("shop add: invalid hex color", async () => {
  resetStore();
  const result = await command.execute(ctx("add", {
    name: "Border", price: 10, description: "d", type: "profile-border", "border-color": "zzz",
  }));
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "Invalid hex");
});

// --- remove ---

Deno.test("shop remove: non-admin rejected", async () => {
  resetStore();
  const result = await command.execute({
    guildId, userId,
    options: { subcommand: "remove", item: 1 },
    memberRoles: [], memberPermissions: 0,
  } as any);
  assertEquals(result.success, false);
  assertStringIncludes(result.error!, "admin");
});

Deno.test("shop remove: valid remove", async () => {
  resetStore();
  await shop.addItem(guildId, { name: "ToRemove", price: 10, description: "d", type: "custom" });
  const result = await command.execute(ctx("remove", { item: 1 }));
  assertEquals(result.success, true);
  assertStringIncludes(result.message!, "Removed");
});
