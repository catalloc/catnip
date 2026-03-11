/**
 * discord/interactions/auto-discover.ts
 *
 * Scans commands/ and components/ directories via Val Town's listFiles API.
 * Used on-demand (?discover=true) to update the KV-stored manifest.
 */

import { listFiles } from "https://esm.town/v/std/utils@85-main/index.ts";
import { kv } from "../persistence/kv.ts";
import type { ManifestData } from "./registry.ts";

const KV_KEY = "manifest";

/**
 * Scan the project for command/component files, save to KV, and return the result.
 */
export async function discover(callerUrl: string): Promise<ManifestData> {
  const files = await listFiles(callerUrl);
  const paths: string[] = files.map((f: { path: string }) => f.path);

  // Use this file's own URL to compute the base directory, since commands/
  // and components/ are siblings of this file in discord/interactions/.
  const selfPathname = new URL(import.meta.url).pathname;
  const prefixMatch = selfPathname.match(/^\/v\/[^/]+\/[^/]+\//);
  const selfRelPath = prefixMatch
    ? selfPathname.slice(prefixMatch[0].length)
    : selfPathname.replace(/^\//, "");
  const baseDir = selfRelPath.slice(0, selfRelPath.lastIndexOf("/") + 1);

  function findFiles(subDir: string): string[] {
    const dirPath = baseDir + subDir + "/";
    return paths
      .filter((f) => f.endsWith(".ts") && f.startsWith(dirPath) && !f.slice(dirPath.length).includes("/"))
      .map((f) => f.slice(dirPath.length).replace(/\.ts$/, ""))
      .sort();
  }

  const manifest: ManifestData = {
    commands: findFiles("commands"),
    components: findFiles("components"),
  };

  await kv.set(KV_KEY, manifest);
  return manifest;
}
