import "../../test/_mocks/env.ts";
import { assertEquals } from "../../test/assert.ts";
import { sqlite } from "../../test/_mocks/sqlite.ts";
import {
  checkEntityAccess,
  blobAllow,
  blobDeny,
  kvAllow,
  kvDeny,
  type PermissionEntry,
} from "./permissions.ts";

const ADMIN_PERMISSIONS = "8";

function resetStore() {
  (sqlite as any)._reset();
}

// ── checkEntityAccess ──

Deno.test("checkEntityAccess: admin always allowed", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: ["r1"] };
  assertEquals(await checkEntityAccess(entry, "g1", "u1", [], ADMIN_PERMISSIONS), true);
});

Deno.test("checkEntityAccess: allowed user passes", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedUsers: ["u5"] };
  assertEquals(await checkEntityAccess(entry, "g1", "u5", [], "0"), true);
});

Deno.test("checkEntityAccess: allowed role passes", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: ["r1"] };
  assertEquals(await checkEntityAccess(entry, "g1", "u2", ["r1"], "0"), true);
});

Deno.test("checkEntityAccess: wrong role denied", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: ["r1"] };
  assertEquals(await checkEntityAccess(entry, "g1", "u2", ["r999"], "0"), false);
});

Deno.test("checkEntityAccess: defaultOpen=true — open when no restrictions", async () => {
  resetStore();
  const entry: PermissionEntry = {};
  assertEquals(await checkEntityAccess(entry, "g1", "u2", [], "0"), true);
});

Deno.test("checkEntityAccess: defaultOpen=false — denied when no restrictions", async () => {
  resetStore();
  const entry: PermissionEntry = {};
  assertEquals(await checkEntityAccess(entry, "g1", "u2", [], "0", { defaultOpen: false }), false);
});

Deno.test("checkEntityAccess: denied when only other users allowed", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedUsers: ["u5"] };
  assertEquals(await checkEntityAccess(entry, "g1", "u6", [], "0"), false);
});

// ── blobAllow / blobDeny ──

function makeBlobStore(): { store: Record<string, PermissionEntry>; cacheInvalidated: boolean } {
  return { store: {}, cacheInvalidated: false };
}

Deno.test("blobAllow: adds role to entry", async () => {
  resetStore();
  const state = makeBlobStore();
  state.store["test"] = { allowedRoles: [] };

  const result = await blobAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "r1", targetType: "role",
    getEntry: async () => state.store["test"],
    saveEntry: async (e) => { state.store["test"] = e; },
    invalidateCache: () => { state.cacheInvalidated = true; },
  });

  assertEquals(result.success, true);
  assertEquals(state.store["test"].allowedRoles, ["r1"]);
  assertEquals(state.cacheInvalidated, true);
});

Deno.test("blobAllow: rejects duplicate", async () => {
  resetStore();
  const state = makeBlobStore();
  state.store["test"] = { allowedRoles: ["r1"] };

  const result = await blobAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "r1", targetType: "role",
    getEntry: async () => state.store["test"],
    saveEntry: async (e) => { state.store["test"] = e; },
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("already has"), true);
});

Deno.test("blobAllow: rejects non-admin", async () => {
  resetStore();
  const result = await blobAllow({
    guildId: "g1", userId: "u2", memberRoles: [], memberPermissions: "0",
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "r1", targetType: "role",
    getEntry: async () => ({}),
    saveEntry: async () => {},
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("admin"), true);
});

Deno.test("blobAllow: returns error when entry not found", async () => {
  resetStore();
  const result = await blobAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "r1", targetType: "role",
    getEntry: async () => null,
    saveEntry: async () => {},
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("not found"), true);
});

Deno.test("blobDeny: removes role from entry", async () => {
  resetStore();
  const state = makeBlobStore();
  state.store["test"] = { allowedRoles: ["r1", "r2"] };

  const result = await blobDeny({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "r1", targetType: "role",
    getEntry: async () => state.store["test"],
    saveEntry: async (e) => { state.store["test"] = e; },
    invalidateCache: () => { state.cacheInvalidated = true; },
  });

  assertEquals(result.success, true);
  assertEquals(state.store["test"].allowedRoles, ["r2"]);
});

Deno.test("blobDeny: rejects when not in list", async () => {
  resetStore();
  const result = await blobDeny({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "r1", targetType: "role",
    getEntry: async () => ({ allowedRoles: [] }),
    saveEntry: async () => {},
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("doesn't have"), true);
});

Deno.test("blobAllow/Deny: works for user targetType", async () => {
  resetStore();
  const state = makeBlobStore();
  state.store["test"] = { allowedUsers: [] };

  const addResult = await blobAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "u5", targetType: "user",
    getEntry: async () => state.store["test"],
    saveEntry: async (e) => { state.store["test"] = e; },
    invalidateCache: () => {},
  });
  assertEquals(addResult.success, true);
  assertEquals(state.store["test"].allowedUsers, ["u5"]);

  const removeResult = await blobDeny({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "paste", verb: "view",
    targetId: "u5", targetType: "user",
    getEntry: async () => state.store["test"],
    saveEntry: async (e) => { state.store["test"] = e; },
    invalidateCache: () => {},
  });
  assertEquals(removeResult.success, true);
  assertEquals(state.store["test"].allowedUsers, []);
});

// ── kvAllow / kvDeny ──

Deno.test("kvAllow: adds role via update callback", async () => {
  resetStore();
  let storedEntry: PermissionEntry = { allowedRoles: [] };

  const result = await kvAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "tag", verb: "view",
    targetId: "r1", targetType: "role",
    kvUpdate: async (mutator) => {
      const { entry, error } = mutator(storedEntry);
      if (entry) storedEntry = entry;
      return error;
    },
    invalidateCache: () => {},
  });

  assertEquals(result.success, true);
  assertEquals(storedEntry.allowedRoles, ["r1"]);
});

Deno.test("kvAllow: returns error when entry not found", async () => {
  resetStore();
  const result = await kvAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "tag", verb: "view",
    targetId: "r1", targetType: "role",
    kvUpdate: async (mutator) => {
      const { error } = mutator(null);
      return error;
    },
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("not found"), true);
});

Deno.test("kvDeny: removes user via update callback", async () => {
  resetStore();
  let storedEntry: PermissionEntry = { allowedUsers: ["u5", "u6"] };

  const result = await kvDeny({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "test", entityLabel: "tag", verb: "view",
    targetId: "u5", targetType: "user",
    kvUpdate: async (mutator) => {
      const { entry, error } = mutator(storedEntry);
      if (entry) storedEntry = entry;
      return error;
    },
    invalidateCache: () => {},
  });

  assertEquals(result.success, true);
  assertEquals(storedEntry.allowedUsers, ["u6"]);
});

Deno.test("kvDeny: rejects non-admin", async () => {
  resetStore();
  const result = await kvDeny({
    guildId: "g1", userId: "u2", memberRoles: [], memberPermissions: "0",
    entityName: "test", entityLabel: "tag", verb: "view",
    targetId: "u5", targetType: "user",
    kvUpdate: async (mutator) => {
      const { error } = mutator({ allowedUsers: ["u5"] });
      return error;
    },
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("admin"), true);
});

// --- empty allowedRoles + empty allowedUsers = open access ---

Deno.test("checkEntityAccess: empty arrays = open access (defaultOpen=true)", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: [], allowedUsers: [] };
  assertEquals(await checkEntityAccess(entry, "g1", "u1", [], "0"), true);
});

// --- both allowedRoles and allowedUsers set: either grants access ---

Deno.test("checkEntityAccess: role match grants access even with non-matching user", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: ["r1"], allowedUsers: ["u5"] };
  // User u2 has role r1 — should be allowed even though u2 is not in allowedUsers
  assertEquals(await checkEntityAccess(entry, "g1", "u2", ["r1"], "0"), true);
});

Deno.test("checkEntityAccess: user match grants access even with non-matching role", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: ["r1"], allowedUsers: ["u5"] };
  // User u5 has no matching roles — should be allowed because u5 is in allowedUsers
  assertEquals(await checkEntityAccess(entry, "g1", "u5", ["r999"], "0"), true);
});

// --- Security edge case tests ---

Deno.test("permissions: checkEntityAccess with both allowedUsers and allowedRoles set, user in users list passes", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: ["r1", "r2"], allowedUsers: ["u10", "u11"] };
  // User u10 is in allowedUsers, has no matching roles — should pass via user list
  assertEquals(await checkEntityAccess(entry, "g1", "u10", ["r999"], "0"), true);
});

Deno.test("permissions: checkEntityAccess with empty roles array and empty users array uses defaultOpen", async () => {
  resetStore();
  const entry: PermissionEntry = { allowedRoles: [], allowedUsers: [] };
  // defaultOpen=true (default) — should allow
  assertEquals(await checkEntityAccess(entry, "g1", "u99", [], "0"), true);
  // Explicitly pass defaultOpen=true
  assertEquals(await checkEntityAccess(entry, "g1", "u99", [], "0", { defaultOpen: true }), true);
});

Deno.test("permissions: checkEntityAccess defaultOpen=false denies when no lists set", async () => {
  resetStore();
  // No allowedRoles/allowedUsers at all — defaultOpen=false should deny
  const entry: PermissionEntry = {};
  assertEquals(await checkEntityAccess(entry, "g1", "u99", [], "0", { defaultOpen: false }), false);
  // Also with empty arrays
  const entry2: PermissionEntry = { allowedRoles: [], allowedUsers: [] };
  assertEquals(await checkEntityAccess(entry2, "g1", "u99", [], "0", { defaultOpen: false }), false);
});

Deno.test("permissions: kvAllow with entry not found returns error", async () => {
  resetStore();
  const result = await kvAllow({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "missing-tag", entityLabel: "tag", verb: "view",
    targetId: "r1", targetType: "role",
    kvUpdate: async (mutator) => {
      const { error } = mutator(null);
      return error;
    },
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("not found"), true);
  assertEquals(result.error!.includes("missing-tag"), true);
});

Deno.test("permissions: kvDeny target not in list returns error message", async () => {
  resetStore();
  const result = await kvDeny({
    guildId: "g1", userId: "u1", memberRoles: [], memberPermissions: ADMIN_PERMISSIONS,
    entityName: "my-tag", entityLabel: "tag", verb: "view",
    targetId: "r999", targetType: "role",
    kvUpdate: async (mutator) => {
      const { entry, error } = mutator({ allowedRoles: ["r1", "r2"] });
      return error;
    },
    invalidateCache: () => {},
  });

  assertEquals(result.success, false);
  assertEquals(result.error!.includes("doesn't have"), true);
  assertEquals(result.error!.includes("my-tag"), true);
});
