/**
 * discord/linked-roles/routes.ts
 *
 * HTTP route handlers for the Linked Roles OAuth2 flow.
 *
 *   GET /linked-roles          → 302 to Discord OAuth2 consent
 *   GET /linked-roles/callback → exchange code, verify, push metadata
 */

import { CONFIG } from "../constants.ts";
import { linkedRolesSuccessPage, linkedRolesErrorPage } from "../pages.ts";
import type { Verifier } from "./define-verifier.ts";
import { generateState, verifyState } from "./state.ts";
import { exchangeCode, fetchUser, pushMetadata } from "./oauth.ts";

// ---------------------------------------------------------------------------
// Verifier registry (single active verifier)
// ---------------------------------------------------------------------------

let activeVerifier: Verifier | null = null;

export function setVerifier(verifier: Verifier): void {
  activeVerifier = verifier;
}

export function getVerifier(): Verifier | null {
  return activeVerifier;
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/** Derive the callback URL from the incoming request's origin. */
function getRedirectUri(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/linked-roles/callback`;
}

// ---------------------------------------------------------------------------
// GET /linked-roles — redirect to Discord OAuth2 consent screen
// ---------------------------------------------------------------------------

export async function handleLinkedRolesRedirect(
  req: Request,
): Promise<Response> {
  const state = await generateState();
  const redirectUri = getRedirectUri(req.url);

  const baseScopes = ["role_connections.write", "identify"];
  const extra = activeVerifier?.scopes ?? [];
  const allScopes = [...new Set([...baseScopes, ...extra])];

  const params = new URLSearchParams({
    client_id: CONFIG.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: allScopes.join(" "),
    state,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: `https://discord.com/oauth2/authorize?${params}` },
  });
}

// ---------------------------------------------------------------------------
// GET /linked-roles/callback — handle OAuth2 callback
// ---------------------------------------------------------------------------

export async function handleLinkedRolesCallback(
  req: Request,
): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // --- Validate params ---
  if (!code || !state) {
    return linkedRolesErrorPage("Missing code or state parameter.");
  }

  if (!(await verifyState(state))) {
    return linkedRolesErrorPage("Invalid or expired state. Please try again.");
  }

  if (!activeVerifier) {
    return linkedRolesErrorPage("No verifier configured.");
  }

  try {
    // --- Exchange code for tokens ---
    const redirectUri = getRedirectUri(req.url);
    const tokens = await exchangeCode(code, redirectUri);

    // --- Fetch user profile ---
    const user = await fetchUser(tokens.access_token);

    // --- Run verifier ---
    const result = await activeVerifier.verify(user, tokens.access_token);

    // --- Push metadata to Discord ---
    await pushMetadata(tokens.access_token, result);

    const displayName = user.global_name ?? user.username;
    return linkedRolesSuccessPage(displayName);
  } catch (err) {
    console.error("[linked-roles] callback error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return linkedRolesErrorPage(message);
  }
}
