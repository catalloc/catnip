import "../../../test/_mocks/env.ts";
import { assertEquals, assertRejects } from "../../../test/assert.ts";
import { mockFetch, restoreFetch } from "../../../test/_mocks/fetch.ts";

// Import the verifier to trigger setVerifier
import "./steam.ts";
import { getVerifier } from "../routes.ts";

const verifier = getVerifier()!;
const user = { id: "u1", username: "user", global_name: "User" };

Deno.test("steam: no Steam connection throws", async () => {
  Deno.env.set("STEAM_API_KEY", "test_key");
  // fetchConnections returns no steam connection
  mockFetch({ default: { status: 200, body: [{ type: "github", id: "gh1", name: "octo", verified: true, visibility: 1 }] } });
  try {
    await assertRejects(
      () => verifier.verify(user, "tok"),
      Error,
      "No Steam account linked",
    );
  } finally {
    restoreFetch();
    Deno.env.delete("STEAM_API_KEY");
  }
});

Deno.test("steam: missing STEAM_API_KEY throws", async () => {
  Deno.env.delete("STEAM_API_KEY");
  mockFetch({ default: { status: 200, body: [] } });
  try {
    await assertRejects(
      () => verifier.verify(user, "tok"),
      Error,
      "STEAM_API_KEY",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("steam: valid flow returns games_owned and account_age_days", async () => {
  Deno.env.set("STEAM_API_KEY", "test_key");
  const steamConn = { type: "steam", id: "76561198000000000", name: "gamer", verified: true, visibility: 1 };
  mockFetch({
    responses: [
      // fetchConnections
      { status: 200, body: [steamConn] },
      // fetchSteamPlayer
      { status: 200, body: { response: { players: [{ timecreated: 1300000000 }] } } },
      // fetchOwnedGames
      { status: 200, body: { response: { game_count: 150 } } },
    ],
  });
  try {
    const result = await verifier.verify(user, "tok");
    assertEquals(result.metadata.games_owned, 150);
    assertEquals(result.metadata.account_age_days > 0, true);
    assertEquals(result.platformName, "Steam");
  } finally {
    restoreFetch();
    Deno.env.delete("STEAM_API_KEY");
  }
});

Deno.test("steam: private profile (no timecreated) defaults to 0 days", async () => {
  Deno.env.set("STEAM_API_KEY", "test_key");
  const steamConn = { type: "steam", id: "76561198000000000", name: "private", verified: true, visibility: 1 };
  mockFetch({
    responses: [
      // fetchConnections
      { status: 200, body: [steamConn] },
      // fetchSteamPlayer - no timecreated
      { status: 200, body: { response: { players: [{}] } } },
      // fetchOwnedGames - no game_count
      { status: 200, body: { response: {} } },
    ],
  });
  try {
    const result = await verifier.verify(user, "tok");
    assertEquals(result.metadata.account_age_days, 0);
    assertEquals(result.metadata.games_owned, 0);
  } finally {
    restoreFetch();
    Deno.env.delete("STEAM_API_KEY");
  }
});
