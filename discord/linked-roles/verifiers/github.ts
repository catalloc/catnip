/**
 * discord/linked-roles/verifiers/github.ts
 *
 * Verifier: GitHub Profile
 * Pattern: Discord connections + public GitHub API.
 * Requires the `connections` OAuth scope to read the user's linked accounts.
 */

import {
  defineVerifier,
  MetadataType,
} from "../define-verifier.ts";
import { setVerifier } from "../routes.ts";
import { fetchConnections } from "../oauth.ts";

interface GitHubUser {
  public_repos: number;
  created_at: string;
}

async function fetchGitHubUser(username: string): Promise<GitHubUser> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "catnip-discord-bot",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${text}`);
  }
  return res.json();
}

const github = defineVerifier({
  name: "GitHub",

  scopes: ["connections"],

  metadata: [
    {
      key: "public_repos",
      name: "Public Repos",
      description: "Number of public repositories on GitHub",
      type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL,
    },
    {
      key: "account_age_days",
      name: "GitHub Account Age (days)",
      description: "Number of days since the GitHub account was created",
      type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL,
    },
  ],

  async verify(user, accessToken) {
    const connections = await fetchConnections(accessToken);
    const gh = connections.find((c) => c.type === "github");

    if (!gh) {
      throw new Error(
        "No GitHub account linked to your Discord profile. " +
        "Go to Discord Settings → Connections → Add GitHub, then try again.",
      );
    }

    const ghUser = await fetchGitHubUser(gh.name);
    const createdAt = new Date(ghUser.created_at);
    const ageDays = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      platformName: "GitHub",
      platformUsername: gh.name,
      metadata: {
        public_repos: ghUser.public_repos,
        account_age_days: ageDays,
      },
    };
  },
});

setVerifier(github);
