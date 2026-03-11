/**
 * discord/interactions/errors.ts
 *
 * Error types for interaction handling.
 */

export class UserFacingError extends Error {
  constructor(public readonly userMessage: string, internalMessage?: string) {
    super(internalMessage ?? userMessage);
    this.name = "UserFacingError";
  }
}
