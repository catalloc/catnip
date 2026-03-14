/**
 * discord/persistence/log-config.ts
 *
 * Global logging configuration stored in KV.
 * Controls which command/cron paths have their routine (info/debug)
 * webhook logs suppressed. Warnings and errors always get through.
 *
 * Path format:
 *   cmd:<name>             — slash command (e.g., cmd:games)
 *   cmd:<name>:<sub>       — specific subcommand (e.g., cmd:games:coinflip)
 *   cron:<name>            — cron job (e.g., cron:reminders)
 *
 * Prefix matching: muting "cmd:games" also mutes "cmd:games:coinflip".
 */

import { kv } from "./kv.ts";

export const MUTED_PATHS_KEY = "logging:muted_paths";
const MAX_MUTED_PATHS = 100;

export const logConfig = {
  async getMutedPaths(): Promise<string[]> {
    return (await kv.get<string[]>(MUTED_PATHS_KEY)) ?? [];
  },

  async addMutedPath(path: string): Promise<boolean> {
    let added = false;
    await kv.update<string[]>(MUTED_PATHS_KEY, (current) => {
      const paths = current ?? [];
      if (paths.includes(path)) return paths;
      if (paths.length >= MAX_MUTED_PATHS) return paths;
      added = true;
      return [...paths, path];
    });
    return added;
  },

  async removeMutedPath(path: string): Promise<boolean> {
    let removed = false;
    await kv.update<string[]>(MUTED_PATHS_KEY, (current) => {
      if (!current) return [];
      const idx = current.indexOf(path);
      if (idx === -1) return current;
      removed = true;
      return [...current.slice(0, idx), ...current.slice(idx + 1)];
    });
    return removed;
  },
};

/**
 * Check if a path is muted. Supports prefix matching:
 * muting "cmd:games" also mutes "cmd:games:coinflip".
 */
export function isPathMuted(path: string, mutedPaths: string[]): boolean {
  return mutedPaths.some(
    (muted) => path === muted || path.startsWith(muted + ":"),
  );
}
