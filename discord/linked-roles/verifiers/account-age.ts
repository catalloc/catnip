/**
 * discord/linked-roles/verifiers/account-age.ts
 *
 * Verifier: Discord Account Age
 * Pattern: Local only — extracts the creation timestamp from the user's
 * snowflake ID. No external APIs, no extra scopes.
 */

import {
  defineVerifier,
  MetadataType,
} from "../define-verifier.ts";
import { setVerifier } from "../routes.ts";

/** Discord epoch (2015-01-01T00:00:00.000Z) in milliseconds. */
const DISCORD_EPOCH = 1420070400000n;

/** Extract the creation date from a Discord snowflake ID. */
function snowflakeToDate(id: string): Date {
  const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH;
  return new Date(Number(ms));
}

const accountAge = defineVerifier({
  name: "Account Age",

  metadata: [
    {
      key: "account_age_days",
      name: "Account Age (days)",
      description: "Number of days since the Discord account was created",
      type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL,
    },
  ],

  verify(user, _accessToken) {
    const created = snowflakeToDate(user.id);
    const ageDays = Math.floor(
      (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      platformName: "Discord",
      platformUsername: user.global_name ?? user.username,
      metadata: { account_age_days: ageDays },
    };
  },
});

setVerifier(accountAge);
