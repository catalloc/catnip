/**
 * Text sanitization helpers
 *
 * File: discord/helpers/sanitize.ts
 */

/** Strip @everyone, @here, and role/user mentions to prevent abuse */
export function sanitizeMentions(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@\u200B$1")
    .replace(/<@[&!]?\d+>/g, "[mention removed]");
}
