/**
 * discord/interactions/define-command.ts
 *
 * Helper for defining self-contained slash commands.
 * Each command file uses defineCommand() to export metadata + handler together.
 */

import { OptionTypes } from "./patterns.ts";
import type { Embed } from "../webhook/send.ts";

/**
 * Registration scope options for commands
 */
export type RegistrationScope =
  | { type: "global" }
  | { type: "guild" };

/**
 * Command option definition (matches Discord API)
 */
export interface CommandOption {
  name: string;
  description: string;
  type: number;
  required: boolean;
  autocomplete?: boolean;
  min_length?: number;
  max_length?: number;
  options?: CommandOption[];
}

/**
 * Result returned from command execution
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
  action?: "added" | "removed" | "toggled" | "set" | "cleared" | string;
  data?: Record<string, any>;
  embed?: Embed;
  /** Action rows containing buttons, select menus, etc. */
  components?: any[];
  /** Open a modal dialog (only valid for non-deferred commands) */
  modal?: { title: string; custom_id: string; components: any[] };
}

/**
 * Execution context passed to command handlers
 */
export interface CommandContext<TConfig = Record<string, any>> {
  guildId: string;
  userId: string;
  options: Record<string, any>;
  config: TConfig;
  /** Target user/message ID for context menu commands */
  targetId?: string;
  /** Resolved data for context menu commands (users, members, messages, etc.) */
  resolved?: Record<string, any>;
  /** Member's role IDs in the current guild */
  memberRoles?: string[];
  /** Member's computed permissions bitfield (string) */
  memberPermissions?: string;
}

/**
 * Self-contained command definition with metadata and handlers
 */
export interface Command<TConfig = Record<string, any>> {
  /** Command name (used in Discord) */
  name: string;

  /** Command description shown in Discord */
  description: string;

  /** Command type: 1 = slash (default), 2 = user context menu, 3 = message context menu */
  type?: 1 | 2 | 3;

  /** Command options/arguments */
  options?: CommandOption[];

  /** Where to register this command */
  registration: RegistrationScope;

  /** If false, respond immediately without deferring (for fast commands). Default: true */
  deferred?: boolean;

  /** If false, the response is visible to the whole channel. Default: true (ephemeral) */
  ephemeral?: boolean;

  /** Cooldown in seconds between uses per user (optional) */
  cooldown?: number;

  /** If true, only guild admins (or bot owner) can use this command */
  adminOnly?: boolean;

  /** Command-specific configuration */
  config: TConfig;

  /** Execute the command */
  execute: (ctx: CommandContext<TConfig>) => Promise<CommandResult>;

  /** Handle autocomplete requests (optional) */
  autocomplete?: (body: any, config: TConfig) => Promise<Response> | Response;
}

/**
 * Input type for defineCommand (config is optional for simple commands)
 */
export type CommandInput<TConfig = Record<string, any>> = {
  name: string;
  description: string;
  type?: 1 | 2 | 3;
  options?: CommandOption[];
  registration: RegistrationScope;
  deferred?: boolean;
  ephemeral?: boolean;
  cooldown?: number;
  adminOnly?: boolean;
  config?: TConfig;
  execute: (ctx: CommandContext<TConfig>) => Promise<CommandResult>;
  autocomplete?: (body: any, config: TConfig) => Promise<Response> | Response;
};

/**
 * Define a self-contained slash command.
 *
 * Usage:
 * ```typescript
 * export default defineCommand({
 *   name: "my-command",
 *   description: "Does something cool",
 *   options: [...],
 *   registration: { type: "guild" },
 *   async execute({ guildId, userId, options, config }) {
 *     // Handler has typed access to config
 *     return { success: true, message: "Done!" };
 *   },
 * });
 * ```
 */
export function defineCommand<TConfig = Record<string, any>>(
  input: CommandInput<TConfig>,
): Command<TConfig> {
  return { ...input, config: (input.config ?? {}) as TConfig };
}

export { OptionTypes };
