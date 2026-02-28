/**
 * discord/linked-roles/define-verifier.ts
 *
 * Type definitions and factory for Linked Roles verifiers.
 * Mirrors the defineCommand() / defineComponent() pattern.
 */

/** Discord application role connection metadata types. */
export enum MetadataType {
  INTEGER_LESS_THAN_OR_EQUAL = 1,
  INTEGER_GREATER_THAN_OR_EQUAL = 2,
  INTEGER_EQUAL = 3,
  INTEGER_NOT_EQUAL = 4,
  DATETIME_LESS_THAN_OR_EQUAL = 5,
  DATETIME_GREATER_THAN_OR_EQUAL = 6,
  BOOLEAN_EQUAL = 7,
  BOOLEAN_NOT_EQUAL = 8,
}

/** A single metadata field registered with Discord. */
export interface MetadataField {
  key: string;
  name: string;
  description: string;
  type: MetadataType;
}

/** User info available to the verifier's `verify` function. */
export interface LinkedRolesUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}

/** What the verifier returns after checking a user. */
export interface VerifyResult {
  /** Platform display name shown in the role connection. */
  platformName: string;
  /** Platform username shown in the role connection. */
  platformUsername: string;
  /** Metadata key→value map pushed to Discord. */
  metadata: Record<string, string | number | boolean>;
}

/** A Linked Roles verifier definition. */
export interface Verifier {
  /** Human-readable name for this verifier. */
  name: string;
  /** Metadata schema registered with Discord. */
  metadata: MetadataField[];
  /** Extra OAuth scopes needed by this verifier (e.g. `["connections"]`). */
  scopes?: string[];
  /** Evaluate a user and return the role connection data. */
  verify(user: LinkedRolesUser, accessToken: string): Promise<VerifyResult> | VerifyResult;
}

/** Identity helper — validates the shape at the type level. */
export function defineVerifier(input: Verifier): Verifier {
  return input;
}
