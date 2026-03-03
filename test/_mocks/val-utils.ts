/**
 * test/_mocks/val-utils.ts
 *
 * Stub for Val Town's listFiles() utility used by auto-discover.
 */

export function listFiles(_callerUrl?: string): Promise<Array<{ path: string }>> {
  return Promise.resolve([]);
}
