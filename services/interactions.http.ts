/**
 * services/interactions.http.ts
 *
 * Discord interactions HTTP endpoint.
 *
 * GET paths:
 *   /terms                  — Terms of Service page
 *   /privacy                — Privacy Policy page
 *   /invite                 — Auth-gated invite page (Bearer token required)
 *   /linked-roles           — Linked Roles OAuth2 redirect
 *   /linked-roles/callback  — Linked Roles OAuth2 callback
 *
 * GET params (root):
 *   ?bootstrap=true          — create KV table and indexes (idempotent)
 *   ?discover=true           — scan project files, save manifest to KV
 *   ?register=true           — bulk-register all commands with Discord
 *   ?register-metadata=true  — push linked roles metadata schema to Discord
 *   (none)                   — health check (status, command count, interaction count)
 *
 * POST paths:
 *   /patreon/webhook         — Patreon webhook handler (signature-verified)
 *   (default)                — Discord interaction handler (signature-verified)
 */

import { handleInteraction } from "../discord/interactions/handler.ts";
import { getFailedImports } from "../discord/interactions/registry.ts";
import { syncAllGuilds } from "../discord/interactions/registration.ts";
import { discover } from "../discord/interactions/auto-discover.ts";
import { CONFIG } from "../discord/constants.ts";
import { termsPage, privacyPage, invitePage } from "../discord/pages.ts";
import { handleLinkedRolesRedirect, handleLinkedRolesCallback } from "../discord/linked-roles/routes.ts";
import { registerMetadataSchema } from "../discord/linked-roles/register-metadata.ts";
import { handlePatreonWebhook } from "../discord/linked-roles/patreon-webhook.ts";
import { timingSafeEqual } from "../discord/helpers/crypto.ts";
import { bootstrapKvTable } from "../discord/persistence/kv.ts";
import { createLogger, finalizeAllLoggers } from "../discord/webhook/logger.ts";
import "../discord/linked-roles/verifiers/always-verified.ts"; // side-effect: registers verifier

const logger = createLogger("HTTP");

async function checkPassword(req: Request): Promise<Response | null> {
  const password = CONFIG.adminPassword;
  if (!password) {
    return Response.json({ error: "Forbidden: admin password not configured" }, { status: 403 });
  }
  const header = req.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !(await timingSafeEqual(token, password))) {
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
      if (path === "/invite") {
        const authError = await checkPassword(req);
        if (authError) return authError;
        return invitePage(CONFIG.appId);
      }
      if (path === "/linked-roles") return handleLinkedRolesRedirect(req);
      if (path === "/linked-roles/callback") return handleLinkedRolesCallback(req);

      if (url.searchParams.get("register") === "true") {
        const authError = await checkPassword(req);
        if (authError) return authError;
        try {
          const results = await syncAllGuilds();
          const ok = results.filter((r) => r.success);
          const fail = results.filter((r) => !r.success);
          return Response.json({ registered: ok.length, failed: fail.length, results });
        } catch (err) {
          logger.error("Registration failed:", err);
          return Response.json({ error: "Registration failed" }, { status: 500 });
        }
      }

      if (url.searchParams.get("register-metadata") === "true") {
        const authError = await checkPassword(req);
        if (authError) return authError;
        try {
          const result = await registerMetadataSchema();
          return Response.json(result, { status: result.ok ? 200 : 500 });
        } catch (err) {
          logger.error("Metadata registration failed:", err);
          return Response.json({ error: "Metadata registration failed" }, { status: 500 });
        }
      }

      if (url.searchParams.get("discover") === "true") {
        const authError = await checkPassword(req);
        if (authError) return authError;
        try {
          const manifest = await discover(import.meta.url);
          return Response.json({
            commands: manifest.commands.length,
            components: manifest.components.length,
            manifest,
          });
        } catch (err) {
          logger.error("Discovery failed:", err);
          return Response.json({ error: "Discovery failed" }, { status: 500 });
        }
      }

      if (url.searchParams.get("bootstrap") === "true") {
        const authError = await checkPassword(req);
        if (authError) return authError;
        try {
          await bootstrapKvTable();
          return Response.json({ ok: true, message: "KV table and indexes created" });
        } catch (err) {
          logger.error("Bootstrap failed:", err);
          return Response.json({ error: "Bootstrap failed" }, { status: 500 });
        }
      }

      const failedImports = getFailedImports();
      return Response.json({
        status: failedImports.length > 0 ? "degraded" : "ok",
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/patreon/webhook") {
      return handlePatreonWebhook(req);
    }

    return handleInteraction(req);
  } catch (err) {
    logger.error("Unhandled request error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    // Flush any buffered logs before the isolate terminates
    await finalizeAllLoggers();
  }
}
