/**
 * discord/interactions/registry.ts
 *
 * Unified command & component registry.
 * Reads manifest from KV (populated by ?discover=true).
 * Falls back to static manifest.ts on first deploy.
 */

import { kv } from "../persistence/kv.ts";
import * as staticManifest from "./manifest.ts";
import type { Command } from "./define-command.ts";
import type { ComponentHandler } from "./define-component.ts";
import { createLogger } from "../webhook/logger.ts";

export interface ManifestData {
  commands: string[];
  components: string[];
}

const KV_KEY = "manifest";
const logger = createLogger("Registry");

const FAILED_IMPORTS: string[] = [];
const COMMAND_BY_NAME = new Map<string, Command>();
const EXACT_HANDLERS = new Map<string, ComponentHandler>();
const PREFIX_HANDLERS: ComponentHandler[] = [];

function isCommand(v: unknown): v is Command {
  return !!v && typeof v === "object" && "name" in v && "execute" in v
    && typeof (v as any).name === "string" && typeof (v as any).execute === "function";
}

function isComponent(v: unknown): v is ComponentHandler {
  return !!v && typeof v === "object" && "customId" in v && "execute" in v
    && typeof (v as any).customId === "string" && typeof (v as any).execute === "function";
}

function register(exp: unknown): void {
  if (isCommand(exp)) {
    COMMAND_BY_NAME.set(exp.name, exp);
  } else if (isComponent(exp)) {
    if (exp.match === "exact") {
      EXACT_HANDLERS.set(`${exp.type}:${exp.customId}`, exp);
    } else {
      PREFIX_HANDLERS.push(exp);
    }
  }
}

// Try KV manifest first, fall back to static manifest on KV failure or first deploy
let saved: ManifestData | null = null;
try {
  saved = await kv.get<ManifestData>(KV_KEY);
} catch (err) {
  logger.warn(`KV unavailable during startup, falling back to static manifest: ${err instanceof Error ? err.message : String(err)}`);
}

if (saved) {
  const allFiles = [
    ...saved.commands.map((name) => ({ name, path: `./commands/${name}.ts` })),
    ...saved.components.map((name) => ({ name, path: `./components/${name}.ts` })),
  ];
  const imports = await Promise.allSettled(
    allFiles.map((f) => import(f.path)),
  );
  for (let i = 0; i < imports.length; i++) {
    const result = imports[i];
    if (result.status === "fulfilled") {
      register(result.value.default);
    } else {
      FAILED_IMPORTS.push(allFiles[i].path);
      logger.warn(`Failed to import ${allFiles[i].path}: ${result.reason}`);
    }
  }
} else {
  for (const exp of Object.values(staticManifest)) {
    register(exp);
  }
}

export function getFailedImports(): string[] {
  return FAILED_IMPORTS;
}

export function getCommand(name: string): Command | undefined {
  return COMMAND_BY_NAME.get(name);
}

export function getAllCommands(): Command[] {
  return [...COMMAND_BY_NAME.values()];
}

/**
 * Find a component handler matching the given customId and type.
 * O(1) exact match first, then linear prefix scan.
 */
export function getComponentHandler(
  customId: string,
  type: "button" | "select" | "modal",
): ComponentHandler | undefined {
  return EXACT_HANDLERS.get(`${type}:${customId}`)
    ?? PREFIX_HANDLERS.find((h) => h.type === type && customId.startsWith(h.customId));
}
