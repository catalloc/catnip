import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import adventureCmd from "./adventure.ts";
import { buildCombatComponents, buildItemPickerComponents } from "./adventure.ts";
import { DUNGEONS, getDungeon, dungeon } from "../../economy/dungeon.ts";
import { CONSUMABLE_ITEMS, getShoppableItems, inventory } from "../../economy/inventory.ts";
import { accounts } from "../../economy/accounts.ts";
import { xp } from "../../economy/xp.ts";

function resetStore() {
  (sqlite as any)._reset();
}

async function setupPlayer(guildId: string, userId: string, level = 0, balance = 10000) {
  await accounts.creditBalance(guildId, userId, balance);
  if (level > 0) {
    const xpNeeded = level * 150;
    await xp.grantXp(guildId, userId, xpNeeded);
  }
}

Deno.test("adventure command: metadata", () => {
  assertEquals(adventureCmd.name, "adventure");
  assertEquals(adventureCmd.registration.type, "guild");
});

Deno.test("adventure dungeons: lists all dungeons", async () => {
  resetStore();
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "dungeons" },
    config: {},
  });
  assert(result.success);
  assert(result.embed);
});

Deno.test("adventure inventory: empty inventory", async () => {
  resetStore();
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "inventory" },
    config: {},
  });
  assert(result.success);
  assert(result.message?.includes("empty"));
});

Deno.test("adventure buy: purchases item", async () => {
  resetStore();
  await setupPlayer("g1", "u1");
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "buy", item: "health-potion", quantity: 2 },
    config: {},
  });
  assert(result.success);
  assert(result.message?.includes("Health Potion"));

  const inv = await inventory.get("g1", "u1");
  assertEquals(inv.items[0].quantity, 2);
});

Deno.test("adventure buy: insufficient funds", async () => {
  resetStore();
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "buy", item: "revive-charm" },
    config: {},
  });
  assert(!result.success);
  assert(result.error?.includes("Insufficient"));
});

Deno.test("adventure buy: inventory full refunds", async () => {
  resetStore();
  await setupPlayer("g1", "u1");
  await inventory.addItem("g1", "u1", "health-potion", 5);
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "buy", item: "shield-potion" },
    config: {},
  });
  assert(!result.success);
  assert(result.error?.includes("Inventory full"));
  // Balance should be refunded
  const acc = await accounts.getOrCreate("g1", "u1");
  assertEquals(acc.balance, 10000);
});

Deno.test("adventure enter: starts dungeon session", async () => {
  resetStore();
  await setupPlayer("g1", "u1");
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "enter", dungeon: "goblin-cave" },
    config: {},
  });
  assert(result.success);
  assert(result.embed);
  assert(result.components!.length > 0);

  const session = await dungeon.getSession("g1", "u1");
  assert(session !== null);
  assertEquals(session!.status, "combat");
});

Deno.test("adventure enter: level gate", async () => {
  resetStore();
  const result = await adventureCmd.execute({
    guildId: "g1", userId: "u1",
    options: { subcommand: "enter", dungeon: "skeleton-crypt" },
    config: {},
  });
  assert(!result.success);
  assert(result.error?.includes("Level 8"));
});

Deno.test("buildCombatComponents: includes attack/defend/item buttons", () => {
  const components = buildCombatComponents("u1", false, true, []);
  assertEquals(components.length, 1);
  assertEquals(components[0].components.length, 4);
  assertEquals(components[0].components[0].label, "Attack");
  assertEquals(components[0].components[3].label, "Item");
  assertEquals(components[0].components[3].disabled, false);
});

Deno.test("buildCombatComponents: disables item when no items", () => {
  const components = buildCombatComponents("u1", false, false, []);
  assertEquals(components[0].components[3].disabled, true);
});

Deno.test("buildCombatComponents: adds skill row when has skills", () => {
  const skills = [{ name: "Power Strike", effect: "power-strike" }];
  const components = buildCombatComponents("u1", true, false, skills);
  assertEquals(components.length, 2);
  assertEquals(components[1].components[0].label, "Power Strike");
});

Deno.test("buildItemPickerComponents: shows items and back button", () => {
  const items = [
    { itemId: "health-potion" as const, quantity: 3 },
    { itemId: "shield-potion" as const, quantity: 1 },
  ];
  const components = buildItemPickerComponents("u1", items);
  assertEquals(components[0].components.length, 3); // 2 items + back
  assertEquals(components[0].components[2].label, "Back");
});
