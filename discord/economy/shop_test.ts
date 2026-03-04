import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import { mockFetch, restoreFetch } from "../../test/_mocks/fetch.ts";
import { accounts } from "./accounts.ts";
import { jobs } from "./jobs.ts";
import { shop, _internals } from "./shop.ts";

function resetStore() {
  (sqlite as any)._reset();
}

const guildId = "g1";
const userId = "u1";

Deno.test("shop _internals.shopKey: correct format", () => {
  assertEquals(_internals.shopKey("g1"), "shop:g1");
});

Deno.test("shop getCatalog: returns empty for new guild", async () => {
  resetStore();
  const catalog = await shop.getCatalog(guildId);
  assertEquals(catalog.items.length, 0);
});

Deno.test("shop addItem: adds item", async () => {
  resetStore();
  const result = await shop.addItem(guildId, {
    name: "Burger Flipper Job", price: 100,
    description: "Upgrade to Burger Flipper", type: "job-upgrade",
    unlocksJobTier: "burger-flipper",
  });
  assertEquals(result.success, true);
  assert(result.item);
  assertEquals(result.item!.name, "Burger Flipper Job");
  assertEquals(result.item!.enabled, true);
});

Deno.test("shop removeItem: removes item", async () => {
  resetStore();
  const { item } = await shop.addItem(guildId, { name: "Test", price: 10, description: "test", type: "custom" });
  const removed = await shop.removeItem(guildId, item!.id);
  assertEquals(removed, true);
  const catalog = await shop.getCatalog(guildId);
  assertEquals(catalog.items.length, 0);
});

Deno.test("shop removeItem: returns false for nonexistent", async () => {
  resetStore();
  const removed = await shop.removeItem(guildId, "fake_id");
  assertEquals(removed, false);
});

Deno.test("shop buyItem: job upgrade succeeds", async () => {
  resetStore();
  const { item } = await shop.addItem(guildId, {
    name: "Burger Flipper", price: 100,
    description: "upgrade", type: "job-upgrade",
    unlocksJobTier: "burger-flipper",
  });
  await accounts.creditBalance(guildId, userId, 200);
  const result = await shop.buyItem(guildId, userId, item!.id);
  assertEquals(result.success, true);
  const account = await accounts.getAccount(guildId, userId);
  assertEquals(account?.balance, 100);
  const jobState = await jobs.getJobState(guildId, userId);
  assertEquals(jobState?.tierId, "burger-flipper");
});

Deno.test("shop buyItem: fails with insufficient funds", async () => {
  resetStore();
  const { item } = await shop.addItem(guildId, { name: "Expensive", price: 1000, description: "pricey", type: "custom" });
  await accounts.creditBalance(guildId, userId, 10);
  const result = await shop.buyItem(guildId, userId, item!.id);
  assertEquals(result.success, false);
  assert(result.error?.includes("Insufficient"));
});

Deno.test("shop buyItem: refunds if already have tier", async () => {
  resetStore();
  const { item } = await shop.addItem(guildId, {
    name: "Burger Flipper", price: 100,
    description: "upgrade", type: "job-upgrade",
    unlocksJobTier: "burger-flipper",
  });
  await accounts.creditBalance(guildId, userId, 200);
  await jobs.getOrCreate(guildId, userId);
  await jobs.setTier(guildId, userId, "chef"); // higher tier
  const result = await shop.buyItem(guildId, userId, item!.id);
  assertEquals(result.success, false);
  assert(result.error?.includes("already have"));
  // Balance should be unchanged (refunded)
  const account = await accounts.getAccount(guildId, userId);
  assertEquals(account?.balance, 200);
});

Deno.test("shop buyItem: cosmetic role grants role via API", async () => {
  resetStore();
  const { item } = await shop.addItem(guildId, {
    name: "VIP", price: 50, description: "VIP role",
    type: "cosmetic-role", roleId: "role123",
  });
  await accounts.creditBalance(guildId, userId, 100);
  mockFetch({ default: { status: 204, body: {} } });
  try {
    const result = await shop.buyItem(guildId, userId, item!.id);
    assertEquals(result.success, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("shop buyItem: fails for nonexistent item", async () => {
  resetStore();
  const result = await shop.buyItem(guildId, userId, "fake_id");
  assertEquals(result.success, false);
  assert(result.error?.includes("not found"));
});
