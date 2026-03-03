/**
 * discord/helpers/permissions.ts
 *
 * Shared permission checking and CRUD for role/user access lists.
 * Used by paste, template, tag, and other commands with entity-level permissions.
 */

import { isGuildAdmin } from "../constants.ts";

/** Minimal shape for entities with role/user permission lists. */
export interface PermissionEntry {
  allowedRoles?: string[];
  allowedUsers?: string[];
}

/**
 * Check if a user has permission to access an entity.
 *
 * - Admin always passes.
 * - If user is in allowedUsers, passes.
 * - If allowedRoles exist and user has a matching role, passes.
 * - `defaultOpen: true` (default) — open when no restrictions (paste/tag behavior).
 * - `defaultOpen: false` — denied when no restrictions (template behavior: admin-only).
 */
export async function checkEntityAccess(
  entry: PermissionEntry,
  guildId: string,
  userId: string,
  memberRoles: string[],
  memberPermissions?: string,
  opts?: { defaultOpen?: boolean },
): Promise<boolean> {
  const defaultOpen = opts?.defaultOpen ?? true;

  if (await isGuildAdmin(guildId, userId, memberRoles, memberPermissions)) return true;
  if (entry.allowedUsers?.includes(userId)) return true;

  if (entry.allowedRoles?.length) {
    return memberRoles.some((r) => entry.allowedRoles!.includes(r));
  }

  // No role restrictions — check user-only restrictions or default behavior
  if (!entry.allowedUsers?.length && !entry.allowedRoles?.length) return defaultOpen;
  return false;
}

/** Result type matching command handler return shape. */
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

/** Options for blob-storage permission CRUD. */
export interface BlobPermOpts {
  guildId: string;
  userId: string;
  memberRoles: string[];
  memberPermissions?: string;
  entityName: string;
  entityLabel: string;
  verb: string;
  targetId: string;
  targetType: "role" | "user";
  getEntry: () => Promise<PermissionEntry | null>;
  saveEntry: (entry: PermissionEntry) => Promise<void>;
  invalidateCache: () => void;
}

/** Add a role or user to the allow list (blob storage). */
export async function blobAllow(opts: BlobPermOpts): Promise<CommandResult> {
  if (!(await isGuildAdmin(opts.guildId, opts.userId, opts.memberRoles, opts.memberPermissions))) {
    return { success: false, error: `You need admin permissions to manage ${opts.entityLabel} ${opts.targetType}s.` };
  }

  const entry = await opts.getEntry();
  if (!entry) {
    return { success: false, error: `${capitalize(opts.entityLabel)} \`${opts.entityName}\` not found.` };
  }

  const list = opts.targetType === "role" ? "allowedRoles" : "allowedUsers";
  const mention = opts.targetType === "role" ? `<@&${opts.targetId}>` : `<@${opts.targetId}>`;

  entry[list] = entry[list] ?? [];
  if (entry[list]!.includes(opts.targetId)) {
    return { success: false, error: `${mention} already has ${opts.verb} permission for \`${opts.entityName}\`.` };
  }

  entry[list]!.push(opts.targetId);
  await opts.saveEntry(entry);
  opts.invalidateCache();

  return { success: true, message: `${mention} can now ${opts.verb} ${opts.entityLabel} \`${opts.entityName}\`.` };
}

/** Remove a role or user from the allow list (blob storage). */
export async function blobDeny(opts: BlobPermOpts): Promise<CommandResult> {
  if (!(await isGuildAdmin(opts.guildId, opts.userId, opts.memberRoles, opts.memberPermissions))) {
    return { success: false, error: `You need admin permissions to manage ${opts.entityLabel} ${opts.targetType}s.` };
  }

  const entry = await opts.getEntry();
  if (!entry) {
    return { success: false, error: `${capitalize(opts.entityLabel)} \`${opts.entityName}\` not found.` };
  }

  const list = opts.targetType === "role" ? "allowedRoles" : "allowedUsers";
  const mention = opts.targetType === "role" ? `<@&${opts.targetId}>` : `<@${opts.targetId}>`;

  entry[list] = entry[list] ?? [];
  if (!entry[list]!.includes(opts.targetId)) {
    return { success: false, error: `${mention} doesn't have ${opts.verb} permission for \`${opts.entityName}\`.` };
  }

  entry[list] = entry[list]!.filter((id) => id !== opts.targetId);
  await opts.saveEntry(entry);
  opts.invalidateCache();

  return { success: true, message: `${mention} can no longer ${opts.verb} ${opts.entityLabel} \`${opts.entityName}\`.` };
}

/** Options for KV-storage permission CRUD (tag-style, using kv.update). */
export interface KvPermOpts {
  guildId: string;
  userId: string;
  memberRoles: string[];
  memberPermissions?: string;
  entityName: string;
  entityLabel: string;
  verb: string;
  targetId: string;
  targetType: "role" | "user";
  kvUpdate: (mutator: (entry: PermissionEntry | null) => { entry: PermissionEntry | null; error: string | null }) => Promise<string | null>;
  invalidateCache: () => void;
}

/** Add a role or user to the allow list (KV storage). */
export async function kvAllow(opts: KvPermOpts): Promise<CommandResult> {
  if (!(await isGuildAdmin(opts.guildId, opts.userId, opts.memberRoles, opts.memberPermissions))) {
    return { success: false, error: `You need admin permissions to manage ${opts.entityLabel} ${opts.targetType}s.` };
  }

  const list = opts.targetType === "role" ? "allowedRoles" : "allowedUsers";
  const mention = opts.targetType === "role" ? `<@&${opts.targetId}>` : `<@${opts.targetId}>`;

  const error = await opts.kvUpdate((entry) => {
    if (!entry) {
      return { entry: null, error: `${capitalize(opts.entityLabel)} \`${opts.entityName}\` not found.` };
    }
    entry[list] = entry[list] ?? [];
    if (entry[list]!.includes(opts.targetId)) {
      return { entry, error: `${mention} already has ${opts.verb} permission for \`${opts.entityName}\`.` };
    }
    entry[list]!.push(opts.targetId);
    return { entry, error: null };
  });

  opts.invalidateCache();
  if (error) return { success: false, error };
  return { success: true, message: `${mention} can now ${opts.verb} ${opts.entityLabel} \`${opts.entityName}\`.` };
}

/** Remove a role or user from the allow list (KV storage). */
export async function kvDeny(opts: KvPermOpts): Promise<CommandResult> {
  if (!(await isGuildAdmin(opts.guildId, opts.userId, opts.memberRoles, opts.memberPermissions))) {
    return { success: false, error: `You need admin permissions to manage ${opts.entityLabel} ${opts.targetType}s.` };
  }

  const list = opts.targetType === "role" ? "allowedRoles" : "allowedUsers";
  const mention = opts.targetType === "role" ? `<@&${opts.targetId}>` : `<@${opts.targetId}>`;

  const error = await opts.kvUpdate((entry) => {
    if (!entry) {
      return { entry: null, error: `${capitalize(opts.entityLabel)} \`${opts.entityName}\` not found.` };
    }
    entry[list] = entry[list] ?? [];
    if (!entry[list]!.includes(opts.targetId)) {
      return { entry, error: `${mention} doesn't have ${opts.verb} permission for \`${opts.entityName}\`.` };
    }
    entry[list] = entry[list]!.filter((id) => id !== opts.targetId);
    return { entry, error: null };
  });

  opts.invalidateCache();
  if (error) return { success: false, error };
  return { success: true, message: `${mention} can no longer ${opts.verb} ${opts.entityLabel} \`${opts.entityName}\`.` };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
