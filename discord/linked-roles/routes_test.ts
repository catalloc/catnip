import "../../test/_mocks/env.ts";
import { assertEquals, assert, assertStringIncludes } from "../../test/assert.ts";
import { mockFetch, getCalls, restoreFetch } from "../../test/_mocks/fetch.ts";
import {
  setVerifier,
  getVerifier,
  handleLinkedRolesRedirect,
  handleLinkedRolesCallback,
} from "./routes.ts";
import type { Verifier } from "./define-verifier.ts";
import { generateState } from "./state.ts";

const testVerifier: Verifier = {
  name: "TestVerifier",
  metadata: [],
  scopes: ["connections"],
  verify: async (user) => ({
    platformName: "Test",
    platformUsername: user.username,
    metadata: { verified: 1 },
  }),
};

// ---------------------------------------------------------------------------
// Verifier registry
// ---------------------------------------------------------------------------

Deno.test("getVerifier returns null when no verifier has been set", () => {
  // Force-clear the module-level activeVerifier so we can verify default state
  (setVerifier as (v: Verifier | null) => void)(null);
  const v = getVerifier();
  assertEquals(v, null);
});

Deno.test("setVerifier/getVerifier round-trip stores and retrieves the verifier", () => {
  setVerifier(testVerifier);
  const v = getVerifier();
  assertEquals(v?.name, "TestVerifier");
  assertEquals(v?.scopes, ["connections"]);
});

// ---------------------------------------------------------------------------
// handleLinkedRolesRedirect
// ---------------------------------------------------------------------------

Deno.test("handleLinkedRolesRedirect returns 302 status", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  assertEquals(res.status, 302);
});

Deno.test("handleLinkedRolesRedirect Location header points to discord.com/oauth2/authorize", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  const location = res.headers.get("Location")!;
  assert(location.startsWith("https://discord.com/oauth2/authorize?"));
});

Deno.test("handleLinkedRolesRedirect includes base scopes role_connections.write and identify", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  const location = res.headers.get("Location")!;
  assertStringIncludes(location, "role_connections.write");
  assertStringIncludes(location, "identify");
});

Deno.test("handleLinkedRolesRedirect merges verifier extra scopes", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  const location = res.headers.get("Location")!;
  // testVerifier has scopes: ["connections"]
  assertStringIncludes(location, "connections");
});

Deno.test("handleLinkedRolesRedirect includes client_id from CONFIG.appId", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  const location = res.headers.get("Location")!;
  const params = new URLSearchParams(location.split("?")[1]);
  // Test env sets DISCORD_APP_ID to "11111111111111111"
  assertEquals(params.get("client_id"), "11111111111111111");
});

// ---------------------------------------------------------------------------
// handleLinkedRolesCallback
// ---------------------------------------------------------------------------

Deno.test("handleLinkedRolesCallback returns error page when code param is missing", async () => {
  const req = new Request("https://example.com/linked-roles/callback?state=abc");
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assertStringIncludes(text, "Missing code or state parameter");
});

Deno.test("handleLinkedRolesCallback returns error page when state param is missing", async () => {
  const req = new Request("https://example.com/linked-roles/callback?code=abc");
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assertStringIncludes(text, "Missing code or state parameter");
});

Deno.test("handleLinkedRolesCallback returns error page for invalid state", async () => {
  const req = new Request("https://example.com/linked-roles/callback?code=abc&state=invalid");
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assertStringIncludes(text, "Invalid or expired state");
});

Deno.test("handleLinkedRolesCallback returns error page when no verifier is configured", async () => {
  // Clear the active verifier
  (setVerifier as (v: Verifier | null) => void)(null);

  // Generate a valid state so we pass the state check
  const validState = await generateState();

  const req = new Request(
    `https://example.com/linked-roles/callback?code=abc&state=${validState}`,
  );
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assertStringIncludes(text, "No verifier configured");

  // Restore verifier for subsequent tests
  setVerifier(testVerifier);
});

Deno.test("handleLinkedRolesCallback succeeds with valid state and mocked API responses", async () => {
  setVerifier(testVerifier);

  // Generate a valid HMAC-signed state token
  const validState = await generateState();

  // Mock the 3 sequential fetch calls: exchangeCode, fetchUser, pushMetadata
  mockFetch({
    responses: [
      // exchangeCode response
      {
        status: 200,
        body: {
          access_token: "test_token",
          token_type: "Bearer",
          expires_in: 604800,
          refresh_token: "ref",
          scope: "identify",
        },
      },
      // fetchUser response
      {
        status: 200,
        body: {
          id: "123",
          username: "testuser",
          discriminator: "0",
          avatar: null,
          global_name: "TestUser",
        },
      },
      // pushMetadata response
      { status: 200, body: {} },
    ],
  });

  try {
    const req = new Request(
      `https://example.com/linked-roles/callback?code=valid_code&state=${validState}`,
    );
    const res = await handleLinkedRolesCallback(req);
    const text = await res.text();

    // Should return the success page containing the user's global_name
    assertStringIncludes(text, "TestUser");
    assertStringIncludes(text, "Verification Complete");

    // Verify all 3 API calls were made
    const calls = getCalls();
    assertEquals(calls.length, 3);
  } finally {
    restoreFetch();
  }
});
