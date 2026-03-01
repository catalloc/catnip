/**
 * services/interactions.http.ts
 *
 * Discord interactions HTTP endpoint.
 *
 * GET paths:
 *   /terms                  — Terms of Service page
 *   /privacy                — Privacy Policy page
 *   /linked-roles           — Linked Roles OAuth2 redirect
 *   /linked-roles/callback  — Linked Roles OAuth2 callback
 *
 * GET params (root):
 *   ?discover=true           — scan project files, save manifest to KV
 *   ?register=true           — bulk-register all commands with Discord
 *   ?register-metadata=true  — push linked roles metadata schema to Discord
 *   (none)                   — health check (status, command count, interaction count)
 *
 * POST paths:
 *   /patreon/webhook         — Patreon webhook handler (signature-verified)
 *   (default)                — Discord interaction handler (signature-verified)
 */

import { handleInteraction, getInteractionCount } from "../discord/interactions/handler.ts";
import { getAllCommands } from "../discord/interactions/registry.ts";
import { registerAllCommandsFromRegistry } from "../discord/interactions/registration.ts";
import { discover } from "../discord/interactions/auto-discover.ts";
import { CONFIG } from "../discord/constants.ts";
import { termsPage, privacyPage } from "../discord/pages.ts";
import { handleLinkedRolesRedirect, handleLinkedRolesCallback } from "../discord/linked-roles/routes.ts";
import { registerMetadataSchema } from "../discord/linked-roles/register-metadata.ts";
import { handlePatreonWebhook } from "../discord/linked-roles/patreon-webhook.ts";
import { timingSafeEqual } from "../discord/helpers/crypto.ts";
import { finalizeAllLoggers } from "../discord/webhook/logger.ts";
import "../discord/linked-roles/verifiers/always-verified.ts"; // side-effect: registers verifier

function checkPassword(req: Request): Response | null {
  if (!CONFIG.adminPassword) {
    return Response.json({ error: "ADMIN_PASSWORD not configured" }, { status: 503 });
  }
  // Accept password via Authorization header (preferred) or query param (legacy)
  const header = req.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("password");
  const password = CONFIG.adminPassword;
  const tokenMatch = token !== null && timingSafeEqual(token, password);
  const queryMatch = queryToken !== null && timingSafeEqual(queryToken, password);
  if (!tokenMatch && !queryMatch) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, ""); // strip trailing slashes

      if (path === "/terms") return termsPage();
      if (path === "/privacy") return privacyPage();
      if (path === "/linked-roles") return handleLinkedRolesRedirect(req);
      if (path === "/linked-roles/callback") return handleLinkedRolesCallback(req);

      if (url.searchParams.get("register") === "true") {
        const authError = checkPassword(req);
        if (authError) return authError;
        const results = await registerAllCommandsFromRegistry();
        const ok = results.filter((r) => r.success);
        const fail = results.filter((r) => !r.success);
        return Response.json({ registered: ok.length, failed: fail.length, results });
      }

      if (url.searchParams.get("register-metadata") === "true") {
        const authError = checkPassword(req);
        if (authError) return authError;
        const result = await registerMetadataSchema();
        return Response.json(result, { status: result.ok ? 200 : 500 });
      }

      if (url.searchParams.get("discover") === "true") {
        const authError = checkPassword(req);
        if (authError) return authError;
        const manifest = await discover(import.meta.url);
        return Response.json({
          commands: manifest.commands.length,
          components: manifest.components.length,
          manifest,
        });
      }

      return Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        commands: getAllCommands().length,
        interactions: getInteractionCount(),
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/patreon/webhook") {
      return handlePatreonWebhook(req);
    }

    return handleInteraction(req);
  } finally {
    // Flush any buffered logs before the isolate terminates
    await finalizeAllLoggers();
  }
}
