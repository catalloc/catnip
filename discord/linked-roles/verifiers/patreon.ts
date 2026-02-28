/**
 * discord/linked-roles/verifiers/patreon.ts
 *
 * Verifier: Patreon Patron Status
 * Pattern: Webhook populates KV, verifier reads KV.
 * No extra OAuth scopes needed — the Patreon webhook provides the mapping.
 */

import {
  defineVerifier,
  MetadataType,
} from "../define-verifier.ts";
import { setVerifier } from "../routes.ts";
import { kv } from "../../persistence/kv.ts";

export interface PatreonRecord {
  isPatron: boolean;
  patronStatus: string;
  tier: string;
  updatedAt: string;
}

export function patreonKvKey(discordId: string): string {
  return `patreon:discord:${discordId}`;
}

const patreon = defineVerifier({
  name: "Patreon",

  metadata: [
    {
      key: "is_patron",
      name: "Active Patron",
      description: "Whether the user is an active Patreon patron",
      type: MetadataType.BOOLEAN_EQUAL,
    },
  ],

  async verify(user, _accessToken) {
    const record = await kv.get<PatreonRecord>(patreonKvKey(user.id));

    return {
      platformName: "Patreon",
      platformUsername: user.global_name ?? user.username,
      metadata: {
        is_patron: record?.isPatron ? 1 : 0,
      },
    };
  },
});

setVerifier(patreon);
