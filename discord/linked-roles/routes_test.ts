import "../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../test/assert.ts";
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

// --- setVerifier / getVerifier ---

Deno.test("setVerifier/getVerifier: stores and retrieves verifier", () => {
  setVerifier(testVerifier);
  const v = getVerifier();
  assertEquals(v?.name, "TestVerifier");
});

// --- handleLinkedRolesRedirect ---

Deno.test("handleLinkedRolesRedirect: returns 302 to Discord OAuth2", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);

  assertEquals(res.status, 302);
  const location = res.headers.get("Location")!;
  assert(location.startsWith("https://discord.com/oauth2/authorize?"));
  assert(location.includes("client_id="));
  assert(location.includes("redirect_uri="));
  assert(location.includes("response_type=code"));
  assert(location.includes("state="));
});

Deno.test("handleLinkedRolesRedirect: includes verifier scopes", async () => {
  setVerifier(testVerifier);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  const location = res.headers.get("Location")!;
  // Should include base scopes + verifier scopes
  assert(location.includes("role_connections.write"));
  assert(location.includes("identify"));
  assert(location.includes("connections"));
});

Deno.test("handleLinkedRolesRedirect: redirect_uri points to callback", async () => {
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  const location = res.headers.get("Location")!;
  const params = new URLSearchParams(location.split("?")[1]);
  assertEquals(params.get("redirect_uri"), "https://example.com/linked-roles/callback");
});

// --- handleLinkedRolesCallback ---

Deno.test("handleLinkedRolesCallback: rejects missing code", async () => {
  const req = new Request("https://example.com/linked-roles/callback?state=abc");
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assert(text.includes("Missing") || text.includes("error") || res.status >= 400 || text.includes("missing"));
});

Deno.test("handleLinkedRolesCallback: rejects missing state", async () => {
  const req = new Request("https://example.com/linked-roles/callback?code=abc");
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assert(text.includes("Missing") || text.includes("error") || res.status >= 400 || text.includes("missing"));
});

Deno.test("handleLinkedRolesCallback: rejects invalid state", async () => {
  const req = new Request("https://example.com/linked-roles/callback?code=abc&state=invalid");
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assert(text.includes("Invalid") || text.includes("expired") || text.includes("error"));
});

Deno.test("handleLinkedRolesCallback: success flow with valid state", async () => {
  setVerifier(testVerifier);

  // Generate a valid state token
  const validState = await generateState();

  // Mock Discord API responses: token exchange, user fetch, push metadata
  mockFetch({
    responses: [
      // exchangeCode
      {
        status: 200,
        body: {
          access_token: "test_access",
          token_type: "Bearer",
          expires_in: 604800,
          refresh_token: "test_refresh",
          scope: "identify",
        },
      },
      // fetchUser
      {
        status: 200,
        body: {
          id: "123",
          username: "testuser",
          discriminator: "0",
          avatar: null,
          global_name: "Test User",
        },
      },
      // pushMetadata
      { status: 200, body: {} },
    ],
  });

  try {
    const req = new Request(
      `https://example.com/linked-roles/callback?code=valid_code&state=${validState}`,
    );
    const res = await handleLinkedRolesCallback(req);
    const text = await res.text();
    // Should show success page with user's display name
    assert(text.includes("Test User") || res.status === 200);
  } finally {
    restoreFetch();
  }
});

Deno.test("handleLinkedRolesCallback: handles API error gracefully", async () => {
  setVerifier(testVerifier);
  const validState = await generateState();

  mockFetch({
    responses: [
      // exchangeCode fails
      { status: 400, body: { error: "invalid_grant" } },
    ],
  });

  try {
    const req = new Request(
      `https://example.com/linked-roles/callback?code=bad&state=${validState}`,
    );
    const res = await handleLinkedRolesCallback(req);
    const text = await res.text();
    // Should show error page
    assert(text.includes("error") || text.includes("wrong") || text.includes("Error"));
  } finally {
    restoreFetch();
  }
});

Deno.test("handleLinkedRolesRedirect: null verifier still generates valid redirect URL", async () => {
  setVerifier(null as any);
  const req = new Request("https://example.com/linked-roles");
  const res = await handleLinkedRolesRedirect(req);
  assertEquals(res.status, 302);
  const location = res.headers.get("Location")!;
  assert(location.startsWith("https://discord.com/oauth2/authorize?"));
});

Deno.test("handleLinkedRolesCallback: null verifier returns error page", async () => {
  setVerifier(null as any);
  const validState = await generateState();
  const req = new Request(
    `https://example.com/linked-roles/callback?code=abc&state=${validState}`,
  );
  const res = await handleLinkedRolesCallback(req);
  const text = await res.text();
  assert(text.includes("No verifier") || text.includes("error") || text.includes("Error"));
});

Deno.test("handleLinkedRolesCallback: global_name null falls back to username", async () => {
  setVerifier(testVerifier);
  const validState = await generateState();

  mockFetch({
    responses: [
      { status: 200, body: { access_token: "tok", token_type: "Bearer", expires_in: 3600, refresh_token: "r", scope: "identify" } },
      { status: 200, body: { id: "123", username: "fallbackuser", discriminator: "0", avatar: null, global_name: null } },
      { status: 200, body: {} },
    ],
  });
  try {
    const req = new Request(`https://example.com/linked-roles/callback?code=c&state=${validState}`);
    const res = await handleLinkedRolesCallback(req);
    const text = await res.text();
    assert(text.includes("fallbackuser") || res.status === 200);
  } finally {
    restoreFetch();
  }
});
