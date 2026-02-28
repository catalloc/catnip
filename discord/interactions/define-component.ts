/**
 * discord/interactions/define-component.ts
 *
 * Helper for defining component/modal interaction handlers.
 * Each handler file uses defineComponent() to export metadata + handler together.
 */

import type { Embed } from "../webhook/send.ts";

export interface ComponentContext {
  /** The custom_id from the interaction */
  customId: string;
  /** Guild ID */
  guildId: string;
  /** User ID */
  userId: string;
  /** Raw interaction body */
  interaction: any;
  /** Selected values (for select menus) */
  values?: string[];
  /** Modal fields (for modal submissions) */
  fields?: Record<string, string>;
}

export interface ComponentResult {
  success: boolean;
  message?: string;
  error?: string;
  /** If true, update the original message instead of sending a new one */
  updateMessage?: boolean;
  embed?: Embed;
  /** Action rows containing buttons, select menus, etc. */
  components?: any[];
}

export interface ComponentHandler {
  /** The custom_id to match */
  customId: string;
  /** Match mode: "exact" matches the full custom_id, "prefix" matches the start */
  match: "exact" | "prefix";
  /** Component type */
  type: "button" | "select" | "modal";
  /** Execute the component interaction */
  execute: (ctx: ComponentContext) => Promise<ComponentResult>;
}

/**
 * Define a component/modal interaction handler.
 */
export function defineComponent(input: ComponentHandler): ComponentHandler {
  return input;
}
