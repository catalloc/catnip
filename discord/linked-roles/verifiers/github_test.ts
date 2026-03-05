import "../../../test/_mocks/env.ts";
import { assertEquals, assertRejects } from "../../../test/assert.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";

// Import the verifier to trigger setVerifier
import "./github.ts";
import { getVerifier } from "../routes.ts";

const verifier = getVerifier()!;

Deno.test("github: no GitHub connection throws descriptive error", async () => {
  // First response: fetchConnections returns empty array (no github)
  mockFetch({ default: { status: 200, body: [] } });
  try {
    await assertRejects(
      () => verifier.verify({ id: "u1", username: "user", global_name: "User" }, "tok"),
      Error,
      "No GitHub account linked",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("github: valid connection returns public_repos and account_age_days", async () => {
  mockFetch({
    responses: [
      // fetchConnections
      { status: 200, body: [{ type: "github", id: "gh1", name: "octocat", verified: true, visibility: 1 }] },
      // fetchGitHubUser
      { status: 200, body: { public_repos: 42, created_at: "2015-01-01T00:00:00Z" } },
    ],
  });
  try {
    const result = await verifier.verify(
      { id: "u1", username: "user", global_name: "User" },
      "tok",
    );
    assertEquals(result.metadata.public_repos, 42);
    assertEquals(result.metadata.account_age_days > 0, true);
    assertEquals(result.platformName, "GitHub");
    assertEquals(result.platformUsername, "octocat");
  } finally {
    restoreFetch();
  }
});

Deno.test("github: GitHub API error throws", async () => {
  mockFetch({
    responses: [
      // fetchConnections
      { status: 200, body: [{ type: "github", id: "gh1", name: "octocat", verified: true, visibility: 1 }] },
      // fetchGitHubUser - fails
      { status: 404, body: "Not Found" },
    ],
  });
  try {
    await assertRejects(
      () => verifier.verify({ id: "u1", username: "user", global_name: "User" }, "tok"),
      Error,
      "GitHub API error",
    );
  } finally {
    restoreFetch();
  }
});
