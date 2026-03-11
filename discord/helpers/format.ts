/**
 * discord/helpers/format.ts
 *
 * Shared formatting utilities for permission info and Discord timestamps.
 */

/** Format role/user permission lists for display in embed listings. */
export function formatPermissionInfo(
  entry: { allowedRoles?: string[]; allowedUsers?: string[] },
  fallback?: string,
): string {
  const parts: string[] = [];
  if (entry.allowedRoles?.length) {
    parts.push(`roles: ${entry.allowedRoles.map((r) => `<@&${r}>`).join(", ")}`);
  }
  if (entry.allowedUsers?.length) {
    parts.push(`users: ${entry.allowedUsers.map((u) => `<@${u}>`).join(", ")}`);
  }
  if (parts.length) return ` (${parts.join("; ")})`;
  return fallback ? ` (${fallback})` : "";
}

/** Format a millisecond timestamp as a Discord timestamp tag. */
export function discordTimestamp(
  ms: number,
  format: "R" | "F" | "f" | "t" | "T" | "D" | "d" = "R",
): string {
  return `<t:${Math.floor(ms / 1000)}:${format}>`;
}
