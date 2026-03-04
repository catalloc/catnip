import { assertEquals } from "../../test/assert.ts";
import { formatPermissionInfo, discordTimestamp } from "./format.ts";

// ── formatPermissionInfo ──

Deno.test("formatPermissionInfo: empty when no restrictions", () => {
  assertEquals(formatPermissionInfo({}), "");
  assertEquals(formatPermissionInfo({ allowedRoles: [], allowedUsers: [] }), "");
});

Deno.test("formatPermissionInfo: shows roles", () => {
  assertEquals(
    formatPermissionInfo({ allowedRoles: ["r1", "r2"] }),
    " (roles: <@&r1>, <@&r2>)",
  );
});

Deno.test("formatPermissionInfo: shows users", () => {
  assertEquals(
    formatPermissionInfo({ allowedUsers: ["u1"] }),
    " (users: <@u1>)",
  );
});

Deno.test("formatPermissionInfo: shows roles and users", () => {
  assertEquals(
    formatPermissionInfo({ allowedRoles: ["r1"], allowedUsers: ["u1"] }),
    " (roles: <@&r1>; users: <@u1>)",
  );
});

Deno.test("formatPermissionInfo: fallback when no restrictions", () => {
  assertEquals(formatPermissionInfo({}, "admin-only"), " (admin-only)");
});

Deno.test("formatPermissionInfo: ignores fallback when restrictions exist", () => {
  assertEquals(
    formatPermissionInfo({ allowedRoles: ["r1"] }, "admin-only"),
    " (roles: <@&r1>)",
  );
});

// ── discordTimestamp ──

Deno.test("discordTimestamp: default relative format", () => {
  assertEquals(discordTimestamp(1700000000000), "<t:1700000000:R>");
});

Deno.test("discordTimestamp: explicit format", () => {
  assertEquals(discordTimestamp(1700000000000, "F"), "<t:1700000000:F>");
  assertEquals(discordTimestamp(1700000000000, "d"), "<t:1700000000:d>");
});

Deno.test("discordTimestamp: floors fractional seconds", () => {
  assertEquals(discordTimestamp(1700000000500), "<t:1700000000:R>");
});
