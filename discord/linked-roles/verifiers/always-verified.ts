/**
 * discord/linked-roles/verifiers/always-verified.ts
 *
 * Example verifier: registers a single "verified" boolean field
 * and always returns true. Swap this import for your own verifier.
 *
 * Side-effect: calls setVerifier() on import.
 */

import {
  defineVerifier,
  MetadataType,
} from "../define-verifier.ts";
import { setVerifier } from "../routes.ts";

const alwaysVerified = defineVerifier({
  name: "Always Verified",

  metadata: [
    {
      key: "verified",
      name: "Verified",
      description: "Whether the user has been verified",
      type: MetadataType.BOOLEAN_EQUAL,
    },
  ],

  verify(user, _accessToken) {
    return {
      platformName: "Catnip",
      platformUsername: user.global_name ?? user.username,
      metadata: { verified: 1 },
    };
  },
});

setVerifier(alwaysVerified);
