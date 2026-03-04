import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  CONSUMABLE_ITEMS, getConsumableItem, getShoppableItems,
  inventory, _internals,
} from "./inventory.ts";

function resetStore() {
  (sqlite as any)._reset();
}

Deno.test("_internals.inventoryKey: correct format", () => {
  assertEquals(_internals.inventoryKey("g1", "u1"), "inventory:g1:u1");
});

Deno.test("CONSUMABLE_ITEMS: has 12 items", () => {
  assertEquals(CONSUMABLE_ITEMS.length, 12);
});

Deno.test("getConsumableItem: finds by id", () => {
  const item = getConsumableItem("health-potion");
  assertEquals(item?.name, "Health Potion");
  assertEquals(item?.effect.type, "heal");
});

Deno.test("getConsumableItem: undefined for unknown", () => {
  assertEquals(getConsumableItem("fake" as any), undefined);
});

Deno.test("getShoppableItems: excludes null-price items", () => {
  const shoppable = getShoppableItems();
  assert(shoppable.every((i) => i.shopPrice !== null));
  assertEquals(shoppable.length, 9);
});

Deno.test("inventory.get: returns default for new user", async () => {
  resetStore();
  const inv = await inventory.get("g1", "u1");
  assertEquals(inv.items.length, 0);
  assertEquals(inv.carryLimit, _internals.DEFAULT_CARRY_LIMIT);
});

Deno.test("inventory.addItem: adds item to empty inventory", async () => {
  resetStore();
  const result = await inventory.addItem("g1", "u1", "health-potion", 2);
  assert(result.success);
  assertEquals(result.inventory!.items.length, 1);
  assertEquals(result.inventory!.items[0].quantity, 2);
});

Deno.test("inventory.addItem: stacks same item", async () => {
  resetStore();
  await inventory.addItem("g1", "u1", "health-potion", 2);
  const result = await inventory.addItem("g1", "u1", "health-potion", 1);
  assert(result.success);
  assertEquals(result.inventory!.items[0].quantity, 3);
});

Deno.test("inventory.addItem: rejects when over carry limit", async () => {
  resetStore();
  await inventory.addItem("g1", "u1", "health-potion", 5);
  const result = await inventory.addItem("g1", "u1", "shield-potion", 1);
  assert(!result.success);
  assert(result.error!.includes("Inventory full"));
});

Deno.test("inventory.removeItem: removes quantity", async () => {
  resetStore();
  await inventory.addItem("g1", "u1", "health-potion", 3);
  const result = await inventory.removeItem("g1", "u1", "health-potion", 2);
  assert(result.success);
  const inv = await inventory.get("g1", "u1");
  assertEquals(inv.items[0].quantity, 1);
});

Deno.test("inventory.removeItem: removes slot when quantity hits 0", async () => {
  resetStore();
  await inventory.addItem("g1", "u1", "health-potion", 1);
  await inventory.removeItem("g1", "u1", "health-potion", 1);
  const inv = await inventory.get("g1", "u1");
  assertEquals(inv.items.length, 0);
});

Deno.test("inventory.removeItem: error when not enough", async () => {
  resetStore();
  const result = await inventory.removeItem("g1", "u1", "health-potion", 1);
  assert(!result.success);
  assert(result.error!.includes("don't have enough"));
});

Deno.test("inventory.upgradeCarryLimit: increases limit", async () => {
  resetStore();
  const result = await inventory.upgradeCarryLimit("g1", "u1", 8);
  assert(result.success);
  const inv = await inventory.get("g1", "u1");
  assertEquals(inv.carryLimit, 8);
});

Deno.test("inventory.upgradeCarryLimit: rejects downgrade", async () => {
  resetStore();
  await inventory.upgradeCarryLimit("g1", "u1", 8);
  const result = await inventory.upgradeCarryLimit("g1", "u1", 5);
  assert(!result.success);
  assert(result.error!.includes("already"));
});

Deno.test("inventory.listItems: returns items", async () => {
  resetStore();
  await inventory.addItem("g1", "u1", "health-potion", 2);
  await inventory.addItem("g1", "u1", "shield-potion", 1);
  const items = await inventory.listItems("g1", "u1");
  assertEquals(items.length, 2);
});

Deno.test("totalItemCount: sums quantities", () => {
  assertEquals(_internals.totalItemCount([
    { itemId: "health-potion", quantity: 3 },
    { itemId: "shield-potion", quantity: 2 },
  ]), 5);
});

Deno.test("totalItemCount: empty array is 0", () => {
  assertEquals(_internals.totalItemCount([]), 0);
});
