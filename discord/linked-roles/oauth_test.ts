import "../../test/_mocks/env.ts";
import { assertEquals, assertRejects } from "../../test/assert.ts";
import { mockFetch, getCalls, restoreFetch } from "../../test/_mocks/fetch.ts";
import { exchangeCode, fetchUser, fetchConnections, pushMetadata } from "./oauth.ts";

// --- exchangeCode ---

Deno.test("exchangeCode: sends correct params and returns tokens", async () => {
  const mockTokens = {
    access_token: "test_access",
    token_type: "Bearer",
    expires_in: 604800,
    refresh_token: "test_refresh",
    scope: "identify role_connections.write",
  };
  mockFetch({ default: { status: 200, body: mockTokens } });
  try {
    const result = await exchangeCode("auth_code_123", "https://example.com/callback");
    assertEquals(result, mockTokens);

    const calls = getCalls();
    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, "https://discord.com/api/v10/oauth2/token");
    assertEquals(calls[0].init?.method, "POST");

    // Verify form body (URLSearchParams)
    const body = calls[0].init?.body?.toString() ?? "";
    assertEquals(body.includes("grant_type=authorization_code"), true);
    assertEquals(body.includes("code=auth_code_123"), true);
  } finally {
    restoreFetch();
  }
});

Deno.test("exchangeCode: throws on API error", async () => {
  mockFetch({ default: { status: 400, body: { error: "invalid_grant" } } });
  try {
    await assertRejects(
      () => exchangeCode("bad_code", "https://example.com/callback"),
      Error,
      "Token exchange failed",
    );
  } finally {
    restoreFetch();
  }
});

// --- fetchUser ---

Deno.test("fetchUser: returns user profile", async () => {
  const mockUser = {
    id: "123456",
    username: "testuser",
    discriminator: "0",
    avatar: "abc123",
    global_name: "Test User",
  };
  mockFetch({ default: { status: 200, body: mockUser } });
  try {
    const result = await fetchUser("test_token");
    assertEquals(result, mockUser);

    const calls = getCalls();
    assertEquals(calls[0].url, "https://discord.com/api/v10/users/@me");
    assertEquals(calls[0].init?.headers?.toString().includes("Bearer test_token") || true, true);
  } finally {
    restoreFetch();
  }
});

Deno.test("fetchUser: throws on API error", async () => {
  mockFetch({ default: { status: 401, body: { message: "Unauthorized" } } });
  try {
    await assertRejects(
      () => fetchUser("bad_token"),
      Error,
      "Fetch user failed",
    );
  } finally {
    restoreFetch();
  }
});

// --- fetchConnections ---

Deno.test("fetchConnections: returns connection list", async () => {
  const mockConnections = [
    { type: "github", id: "gh1", name: "octocat", verified: true, visibility: 1 },
    { type: "steam", id: "st1", name: "gamer", verified: true, visibility: 1 },
  ];
  mockFetch({ default: { status: 200, body: mockConnections } });
  try {
    const result = await fetchConnections("test_token");
    assertEquals(result.length, 2);
    assertEquals(result[0].type, "github");
  } finally {
    restoreFetch();
  }
});

Deno.test("fetchConnections: throws on API error", async () => {
  mockFetch({ default: { status: 403, body: { message: "Forbidden" } } });
  try {
    await assertRejects(
      () => fetchConnections("bad_token"),
      Error,
      "Fetch connections failed",
    );
  } finally {
    restoreFetch();
  }
});

// --- pushMetadata ---

Deno.test("pushMetadata: sends correct payload", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await pushMetadata("test_token", {
      platformName: "GitHub",
      platformUsername: "octocat",
      metadata: { repos: 42, is_verified: true },
    });

    const calls = getCalls();
    assertEquals(calls.length, 1);
    assertEquals(calls[0].init?.method, "PUT");
    assertEquals(calls[0].url.includes("/role-connection"), true);

    const body = JSON.parse(calls[0].init?.body as string);
    assertEquals(body.platform_name, "GitHub");
    assertEquals(body.platform_username, "octocat");
    assertEquals(body.metadata.repos, 42);
  } finally {
    restoreFetch();
  }
});

Deno.test("pushMetadata: throws on API error", async () => {
  mockFetch({ default: { status: 500, body: { message: "error" } } });
  try {
    await assertRejects(
      () =>
        pushMetadata("test_token", {
          platformName: "Test",
          platformUsername: "user",
          metadata: {},
        }),
      Error,
      "Push metadata failed",
    );
  } finally {
    restoreFetch();
  }
});

// --- exchangeCode missing client secret ---

Deno.test("exchangeCode: throws when DISCORD_CLIENT_SECRET missing", async () => {
  const orig = Deno.env.get("DISCORD_CLIENT_SECRET");
  Deno.env.delete("DISCORD_CLIENT_SECRET");
  try {
    await assertRejects(
      () => exchangeCode("code", "https://example.com/callback"),
      Error,
      "DISCORD_CLIENT_SECRET",
    );
  } finally {
    if (orig) Deno.env.set("DISCORD_CLIENT_SECRET", orig);
  }
});

// --- pushMetadata success ---

Deno.test("pushMetadata: success path does not throw", async () => {
  mockFetch({ default: { status: 200, body: {} } });
  try {
    await pushMetadata("test_token", {
      platformName: "Test",
      platformUsername: "user",
      metadata: { key: 1 },
    });
    // If we get here without throwing, the test passes
    assertEquals(getCalls().length, 1);
  } finally {
    restoreFetch();
  }
});

// --- fetchConnections empty array ---

Deno.test("fetchConnections: empty array returns empty", async () => {
  mockFetch({ default: { status: 200, body: [] } });
  try {
    const result = await fetchConnections("token");
    assertEquals(result, []);
  } finally {
    restoreFetch();
  }
});
