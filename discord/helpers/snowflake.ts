/**
 * discord/helpers/snowflake.ts
 *
 * Discord snowflake ID validation.
 */

const SNOWFLAKE_RE = /^\d{1,20}$/;

export function isSnowflake(id: string): boolean {
  return SNOWFLAKE_RE.test(id);
}

export function assertSnowflake(id: string, label = "ID"): void {
  if (!SNOWFLAKE_RE.test(id)) {
    throw new Error(`Invalid Discord snowflake ${label}: "${id}"`);
  }
}
