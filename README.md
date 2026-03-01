# Catnip

Open source Discord bot built for [Val Town](https://val.town). Ships with slash commands, component interactions, webhook logging, linked roles, and a KV persistence layer — all running on Val Town's serverless Deno isolates.

## Table of Contents

- [Features](#features)
- [Deployment](#deployment)
  - [1. Fork the Project](#1-fork-the-project)
  - [2. Create a Discord Application](#2-create-a-discord-application)
  - [3. Set Environment Variables](#3-set-environment-variables)
  - [4. Configure the Interactions Endpoint](#4-configure-the-interactions-endpoint)
  - [Admin Requests](#admin-requests)
  - [5. Discover Commands](#5-discover-commands)
  - [6. Register Commands](#6-register-commands)
  - [7. Invite the Bot](#7-invite-the-bot)
  - [8. Set Up Cron Jobs](#8-set-up-cron-jobs)
  - [9. Configure Your Server](#9-configure-your-server)
  - [10. Optional: Linked Roles](#10-optional-linked-roles)
  - [11. Optional: Webhook Logging](#11-optional-webhook-logging)
  - [12. Optional: Legal Pages](#12-optional-legal-pages)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [HTTP Endpoint](#http-endpoint)
- [Commands](#commands)
  - [Global Commands](#global-commands)
  - [Guild Commands](#guild-commands)
- [Component Handlers](#component-handlers)
- [Cron Jobs](#cron-jobs)
- [KV Store](#kv-store)
- [Guild Configuration](#guild-configuration)
- [Admin System](#admin-system)
- [Linked Roles](#linked-roles)
- [Webhook Logging](#webhook-logging)
- [Webhook Sending](#webhook-sending)
- [Command Registration](#command-registration)
- [Helpers](#helpers)
- [Adding a New Command](#adding-a-new-command)
- [Adding a Component Handler](#adding-a-component-handler)
- [Modal Dialogs](#modal-dialogs)
- [Select Menus](#select-menus)
- [Pagination with Buttons](#pagination-with-buttons)
- [Project Structure](#project-structure)
- [License](#license)

## Features

- **Slash command framework** — `defineCommand()` with auto-registration, subcommands, autocomplete, and cooldowns
- **Component handling** — Buttons, select menus, and modals via `defineComponent()` with exact and prefix matching
- **Context menu commands** — User and message right-click actions
- **Per-guild configuration** — Admin roles, command enable/disable, all persisted in KV
- **Giveaway system** — Button entry, auto-end via cron, winner picking, reroll
- **Poll system** — Button voting with live counts, auto-end, vote switching
- **Reminders** — Personal time-delayed reminders with exactly-once cron delivery
- **Scheduled messages** — Admin-only delayed message posting
- **React-roles** — Self-assignable role panels with button toggling
- **Tags** — Per-guild text snippets with admin management
- **Dice roller** — Standard TTRPG notation (`2d20+5`)
- **Linked roles** — Discord OAuth2 verification with pluggable verifiers (Steam, GitHub, Patreon, account age)
- **Webhook logging** — Batched Discord webhook logger with log levels and auto-flush
- **Webhook sending** — Message chunking, embed batching, rate-limit handling, fallback support
- **KV persistence** — SQLite-backed key-value store with atomic operations, optimistic concurrency, and time-based queries
- **Production hardened** — Retry logic, rate-limit respect, timing-safe comparisons, exactly-once delivery, panel update throttling
- **Legal pages** — Built-in Terms of Service and Privacy Policy
- **Health check** — `GET /` returns `{ status: "ok" }`

## Deployment

This guide walks you through remixing Catnip on Val Town and getting it running in your Discord server.

### 1. Fork the Project

Go to the [Catnip project on Val Town](https://val.town) and click **Fork** (or **Remix**) to create your own copy. This gives you a full clone of the codebase under your Val Town account that you can customize.

### 2. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Note the following values from the portal — you'll need them for environment variables:
   - **General Information** → `APPLICATION ID` and `PUBLIC KEY`
   - **Bot** → Click **Reset Token** to generate a `BOT TOKEN`
4. Under **Bot**, make sure **Public Bot** is toggled to your preference (on = anyone can invite, off = only you)
5. Under **Bot** → **Privileged Gateway Intents**, no intents are required — the bot is interactions-only and does not use the gateway

### 3. Set Environment Variables

In your Val Town project, go to **Settings** → **Environment Variables** and add:

| Variable | Required | Value |
|---|---|---|
| `DISCORD_APP_ID` | Yes | Application ID from the portal |
| `DISCORD_PUBLIC_KEY` | Yes | Public Key from the portal |
| `DISCORD_BOT_TOKEN` | Yes | Bot token from the portal |
| `DISCORD_APP_OWNER_ID` | Recommended | Your personal Discord user ID (grants global admin bypass) |
| `ADMIN_PASSWORD` | Recommended | A strong password for admin HTTP endpoints |

To find your Discord user ID: enable Developer Mode in Discord settings (App Settings → Advanced → Developer Mode), then right-click your name and click **Copy User ID**.

### 4. Configure the Interactions Endpoint

1. Find the URL of your `interactions.http.ts` val — it will look like `https://<your-username>-catnip-interactionshttp.web.val.run`
2. In the Discord Developer Portal, go to **General Information**
3. Set **Interactions Endpoint URL** to your val's URL
4. Discord will send a verification ping — if your environment variables are set correctly, it will succeed and save

### Admin Requests

Steps 5, 6, and 10 require authenticated HTTP requests to your val. All admin endpoints use the same format:

```http
GET https://YOUR_VAL_URL?discover=true
Authorization: Bearer <your-admin-password>
```

Replace the URL query parameter for each endpoint: `?discover=true`, `?register=true`, `?register-metadata=true`.

### 5. Discover Commands

The bot needs to know what commands and components exist. Make an [admin request](#admin-requests) with `?discover=true`.

This scans `discord/interactions/commands/` and `discord/interactions/components/` and saves the file list to KV. You need to re-run this whenever you add or remove command/component files.

### 6. Register Commands

Register the bot's slash commands with Discord by making an [admin request](#admin-requests) with `?register=true`.

This registers **global commands** (`/ping`, `/help`, `/commands`, `/server`) with Discord's API. Global commands can take up to an hour to propagate.

Alternatively, once global commands are available, use `/commands register all` from Discord to register commands interactively.

### 7. Invite the Bot

Build an invite URL using the Discord Developer Portal:

1. Go to **OAuth2** → **URL Generator**
2. Select scopes: `bot` and `applications.commands`
3. Select bot permissions:
   - **Send Messages** — for reminders, giveaways, polls, scheduled messages
   - **Embed Links** — for rich embed responses
   - **Manage Roles** — for react-roles (role assignment)
   - **Use External Emojis** — for react-role emoji support
   - **Read Message History** — for updating giveaway/poll panels
4. Copy the generated URL and open it in your browser to invite the bot to your server

Alternatively, construct the URL manually:
```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot+applications.commands&permissions=268504128
```

### 8. Set Up Cron Jobs

Features like reminders, giveaways, polls, and scheduled messages require cron jobs to process due items. In Val Town, each cron file is a separate val that runs on a schedule.

For each of these files, set the schedule to **every 1–5 minutes** in Val Town:

| Cron Val | Purpose | Required For |
|---|---|---|
| `services/giveaways.cron.ts` | Auto-end expired giveaways | `/giveaway` |
| `services/polls.cron.ts` | Auto-end expired polls | `/poll` |
| `services/reminders.cron.ts` | Deliver due reminders | `/remind` |
| `services/scheduled-messages.cron.ts` | Deliver due messages | `/schedule` |

If you don't use a feature, you can skip its cron job. The commands will still work — items just won't auto-process until the cron is set up.

### 9. Configure Your Server

Once the bot is in your server and global commands have propagated:

1. **Set admin roles** (optional): `/server admin add role:@Moderator` — lets users with that role manage the bot without needing Discord Administrator permission
2. **Enable guild commands**: `/server commands enable command:giveaway` — enables feature commands one at a time. Repeat for each command you want (e.g. `remind`, `poll`, `tag`, `react-roles`, `schedule`, `r`, etc.)
3. **View config**: `/server info` — shows current admin roles and enabled commands

Guild commands are registered with Discord immediately when enabled and only appear in servers that have enabled them.

### 10. Optional: Linked Roles

If you want to use Discord's [Linked Roles](https://discord.com/developers/docs/tutorials/configuring-app-metadata-for-linked-roles) feature:

1. Set `DISCORD_CLIENT_SECRET` in your Val Town environment variables (found in the Discord Developer Portal under **OAuth2** → **Client Secret**)
2. In the portal under **General Information**, set **Linked Roles Verification URL** to `https://YOUR_VAL_URL/linked-roles`
3. Under **OAuth2** → **Redirects**, add `https://YOUR_VAL_URL/linked-roles/callback`
4. Register the metadata schema by making an [admin request](#admin-requests) with `?register-metadata=true`
5. In your Discord server, go to **Server Settings** → **Roles**, create a role, and under **Links** add your app as a requirement

The default verifier (`always-verified.ts`) approves everyone. Switch to a different verifier (Steam, GitHub, Patreon, account age) by changing the import in `services/interactions.http.ts`. See the [Linked Roles](#linked-roles) section for details.

### 11. Optional: Webhook Logging

To send bot logs to a Discord channel:

1. Create a webhook in a private channel (Channel Settings → Integrations → Webhooks → New Webhook)
2. Copy the webhook URL
3. Set `DISCORD_CONSOLE` in your Val Town environment variables to the webhook URL

The bot will batch and send log entries (info, warn, error) to that channel. Useful for monitoring in production.

### 12. Optional: Legal Pages

Discord requires apps to have a Terms of Service and Privacy Policy URL:

1. In the Discord Developer Portal under **General Information**, set:
   - **Terms of Service URL** → `https://YOUR_VAL_URL/terms`
   - **Privacy Policy URL** → `https://YOUR_VAL_URL/privacy`

The pages are served directly from the bot. To customize the content, edit `discord/pages.ts`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_APP_ID` | Yes | Discord application ID |
| `DISCORD_PUBLIC_KEY` | Yes | Ed25519 public key for interaction signature verification |
| `DISCORD_BOT_TOKEN` | Yes | Bot token for Discord API calls |
| `DISCORD_APP_OWNER_ID` | No | Your Discord user ID (global admin bypass) |
| `DISCORD_CONSOLE` | No | Webhook URL for logger output |
| `DISCORD_CLIENT_SECRET` | No | Required for Linked Roles OAuth2 flow |
| `ADMIN_PASSWORD` | No | Password for admin HTTP endpoints (`?discover`, `?register`, `?register-metadata`) |
| `STEAM_API_KEY` | No | Steam Web API key (for Steam linked role verifier) |
| `PATREON_WEBHOOK_SECRET` | No | Patreon webhook HMAC-MD5 secret |

Required variables throw immediately at module load if missing.

## Architecture

The bot runs entirely on Val Town's serverless platform:

- **HTTP val** (`services/interactions.http.ts`) — Single endpoint handles all Discord interactions, OAuth callbacks, admin endpoints, and legal pages. Each request is a new Deno isolate.
- **Cron vals** (`services/*.cron.ts`) — Scheduled jobs for delivering reminders, ending giveaways/polls, and sending scheduled messages. Each invocation is a new isolate.
- **KV persistence** (`discord/persistence/kv.ts`) — All state is stored in Val Town SQLite via a key-value abstraction with atomic operations.
- **Cold start** — Every isolate re-runs module-level code including registry loading from KV, Ed25519 key import, and logger setup.

## HTTP Endpoint

`services/interactions.http.ts` routes all incoming requests:

### GET Routes

| Path / Query | Auth | Description |
|---|---|---|
| `/terms` | None | Terms of Service page |
| `/privacy` | None | Privacy Policy page |
| `/linked-roles` | None | Initiates Discord OAuth2 for linked role verification |
| `/linked-roles/callback` | None | Handles OAuth2 callback |
| `/?discover=true` | Bearer | Scans project files and saves command/component manifest to KV |
| `/?register=true` | Bearer | Bulk-registers all commands with Discord |
| `/?register-metadata=true` | Bearer | Pushes linked roles metadata schema to Discord |
| `GET /` | None | Health check — `{ "status": "ok", "timestamp": "..." }` |

### POST Routes

| Path | Description |
|---|---|
| `/patreon/webhook` | Patreon membership webhook (HMAC-MD5 verified) |
| `POST /` | Discord interactions endpoint (Ed25519 verified) |

Admin endpoints require a Bearer token header with your admin password.

All loggers are flushed in a `finally` block before the isolate terminates.

## Commands

Commands have two registration types:

- **Global** (`registration: { type: "global" }`) — Available everywhere, registered once via Discord's global commands API
- **Guild** (`registration: { type: "guild" }`) — Must be enabled per-server with `/server commands enable`

### Global Commands

#### `/ping`
Health check. Returns "Pong!" (ephemeral).

#### `/help`
Lists all non-admin commands alphabetically as an embed.

#### `/commands` (admin-only)
Manage command registration with Discord.
- `register <command>` — Register a command (or `all`). Autocomplete shows available commands.
- `unregister <command>` — Unregister from the current guild (or `all`). Autocomplete shows live registered commands.

#### `/server` (admin-only)
Per-guild bot configuration.
- `admin add <role>` — Add a role as a bot admin role (max 25)
- `admin remove <role>` — Remove an admin role
- `admin list` — Show configured admin roles
- `commands enable <command>` — Enable a guild command, registers it with Discord
- `commands disable <command>` — Disable a guild command, deregisters it
- `commands list` — Show status of all guild commands
- `info` — Full guild config summary

### Guild Commands

These must be enabled per-server via `/server commands enable`.

#### `/about`
Bot info embed with command count and runtime details.

#### `/coin-flip`
Flip a coin using cryptographically secure randomness.

#### `/counter [action]`
Per-guild persistent counter. Increment by default, pass `reset` to reset. Uses atomic KV `update()`.

#### `/echo <message>`
Echoes input back. Sanitizes `@everyone`, `@here`, and mention syntax.

#### `/facts`
Browse 8 fun facts with Previous/Next pagination buttons.

#### `/feedback`
Opens a modal dialog with Topic and Details fields. Submission shows a "Feedback Received" embed.

#### `/giveaway` (admin-only)
One active giveaway per guild.
- `create <prize> <duration> <channel> [winners]` — Post a giveaway panel with "Enter Giveaway" button. Duration up to 30 days, 1–10 winners.
- `end` — End early, pick winners, post announcement
- `reroll` — Re-pick winners from the ended giveaway's entrants

Auto-ended by the `giveaways.cron.ts` job. Max 10,000 entrants. Panel updates throttled to 5-second intervals.

#### `/pick <choices>`
Pick a random item from a comma-separated list (min 2 choices).

#### `/poll` (admin-only)
One active poll per guild.
- `create <question> <options> <channel> [duration]` — Post a poll with one button per option (2–10 options, up to 5 per row). Default duration 7 days, max 30 days. Omit duration for no time limit.
- `end` — End the poll, show final results with vote bars and percentages

Vote behavior: click to vote, click same to remove, click different to switch. Max 10,000 voters. Panel updates throttled to 5-second intervals. Auto-ended by `polls.cron.ts`.

#### `/r <dice>`
Roll dice using TTRPG notation. Supports `XdN`, `XdN+M`, `XdN-M`. 1–20 dice, d2–d100. Shows individual rolls and total.

Examples: `/r dice:1d20`, `/r dice:4d6`, `/r dice:2d20+5`

#### `/react-roles` (admin-only)
Self-assignable role panels.
- `add <role> <emoji> <label>` — Add a role (max 25, supports custom and unicode emoji)
- `remove <role>` — Remove a role from the panel
- `list` — Show current configuration
- `send <channel>` — Post or update the role panel (patches existing message if present)
- `clear` — Delete all config

Users click buttons to toggle roles on/off.

#### `/remind <duration> <message>`
Personal reminders. Duration supports `s`, `m`, `h`, `d` and combinations like `1d12h`. Max 10 active per user, max 30 days, max 500 chars. Delivered by `reminders.cron.ts`.

#### `/schedule` (admin-only)
Time-delayed message delivery.
- `send <channel> <time> <message>` — Schedule a message (max 2000 chars, max 30 days)
- `list` — Show pending messages with channel, preview, and relative time
- `cancel <id>` — Cancel a pending message (autocomplete shows pending)

Max 25 per guild. Delivered by `scheduled-messages.cron.ts`.

#### `/slow-echo <message> [delay]`
Deferred command demo. Waits 1–10 seconds (default 3) then echoes. 10-second cooldown.

#### `/tag`
Per-guild text snippets. Anyone can view; admins manage.
- `view <name>` — Display a tag (autocomplete on name)
- `add <name> <content>` — Create a tag (admin-only, max 50 per guild)
- `edit <name> <content>` — Update a tag (admin-only)
- `remove <name>` — Delete a tag (admin-only)
- `list` — Show all tag names

#### `/user-info` (context menu)
Right-click a user to see their display name, username, ID, account creation date, and avatar.

#### `/color-picker`
Select menu demo. Choose a color from a dropdown to see a colored embed.

## Component Handlers

Located in `discord/interactions/components/`. Auto-discovered and matched by `custom_id`.

| File | custom_id | Match | Type | Description |
|---|---|---|---|---|
| `color-select.ts` | `color-select` | exact | select | Color picker dropdown handler |
| `example-button.ts` | `example-button` | exact | button | Demo button |
| `facts-page.ts` | `facts-page:` | prefix | button | Fact pagination |
| `feedback-modal.ts` | `feedback-modal` | exact | modal | Feedback form submission |
| `giveaway-enter.ts` | `giveaway-enter:` | prefix | button | Giveaway entry (atomic dedup, 10k cap) |
| `poll-vote.ts` | `poll-vote:` | prefix | button | Poll voting (toggle/switch, 10k cap) |
| `react-role.ts` | `react-role:` | prefix | button | Role toggle via Discord API |

## Cron Jobs

All cron vals run every 1–5 minutes. Each uses the `listDue()` + `claimDelete()` pattern for exactly-once delivery.

### `giveaways.cron.ts`
Finds expired giveaways, atomically ends them, picks winners, updates panel, posts announcement. Cleans up ended giveaways after a delay.

### `polls.cron.ts`
Finds expired polls, atomically ends them, patches panel with final vote bars and percentages.

### `reminders.cron.ts`
Delivers due reminders in batches of 5. Sends `⏰ <@user>, reminder: {message}` to the original channel. Retries up to 5 times with exponential backoff (1m, 2m, 4m, 8m, 16m). Permanent failures (403/404) drop immediately.

### `scheduled-messages.cron.ts`
Delivers due messages in batches of 5. Same retry and permanent-failure logic as reminders.

### `example.cron.ts`
Template showing webhook usage from a cron job.

## KV Store

`discord/persistence/kv.ts` — SQLite-backed key-value store. Table: `kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, due_at INTEGER)` with an index on `due_at`.

### Methods

| Method | Description |
|---|---|
| `get<T>(key)` | Read a value by key |
| `set(key, value, dueAt?)` | Upsert. Optional `dueAt` (epoch ms) for time-based queries. |
| `delete(key)` | Delete by key |
| `claimDelete(key)` | Atomically delete and return `true` if existed. For exactly-once delivery. |
| `list(prefix?, limit?)` | List entries by prefix. Limit enforced in TypeScript (Val Town SQLite has no `LIMIT`). |
| `listDue(now, prefix?, limit?)` | List entries where `due_at <= now`. |
| `update<T>(key, fn, retries?)` | Atomic read-modify-write with optimistic concurrency (CAS). Falls back to unconditional write. |
| `claimUpdate<T>(key, fn, retries?)` | Like `update()` but strict claim semantics — returns `null` on missing key, null return, or exhausted retries. No fallback. |

### Usage

```typescript
import { kv } from "../../persistence/kv.ts";

await kv.set("user:123", { score: 42 });
const data = await kv.get<{ score: number }>("user:123");
await kv.delete("user:123");
const all = await kv.list("user:");
```

### Key Namespaces

| Prefix | Description |
|---|---|
| `cooldown:{command}:{userId}` | Per-user command cooldown expiry |
| `counter:{guildId}` | Guild counter value |
| `giveaway:{guildId}` | Active/ended giveaway state |
| `guild_config:{guildId}` | Admin roles, enabled commands |
| `manifest` | Command/component file manifest |
| `patreon:discord:{discordId}` | Patreon patron record |
| `poll:{guildId}` | Active/ended poll state |
| `ratelimit:patreon` | Patreon webhook rate limit |
| `react-roles:{guildId}` | Role panel config |
| `reminder:{userId}:{guildId}:{ts}-{rnd}` | Individual reminder with `due_at` |
| `scheduled-msg:{guildId}:{ts}-{rnd}` | Individual scheduled message with `due_at` |
| `tags:{guildId}` | All tags for a guild |

## Guild Configuration

`discord/persistence/guild-config.ts` — Stored at `guild_config:{guildId}`.

```typescript
interface GuildConfig {
  guildId: string;
  adminRoleIds: string[];    // up to 25
  enabledCommands: string[]; // up to 50
  createdAt: string;
  updatedAt: string;
}
```

Methods: `get()`, `getAdminRoleIds()`, `getEnabledCommands()`, `setAdminRoles()`, `addAdminRole()`, `removeAdminRole()`, `enableCommand()`, `disableCommand()`, `listGuilds()`.

## Admin System

`isGuildAdmin(guildId, userId, memberRoles, memberPermissions?)` in `discord/constants.ts` uses a three-tier check:

1. **Bot owner** — User ID matches `CONFIG.appOwnerId` (global bypass)
2. **Server administrator** — Member permissions bitfield has the `ADMINISTRATOR` bit
3. **Configured admin role** — Member has any role in the guild's `adminRoleIds` from KV

Commands with `adminOnly: true` are gated by this check before execution.

### Embed Colors

```typescript
SUCCESS: 0x57f287  // green
ERROR:   0xed4245  // red
INFO:    0x5865f2  // blurple
WARNING: 0xfee75c  // yellow
```

## Linked Roles

Discord's [Linked Roles](https://discord.com/developers/docs/tutorials/configuring-app-metadata-for-linked-roles) feature lets server admins gate roles behind external account verification.

### Setup

1. Set `DISCORD_CLIENT_SECRET` environment variable
2. In the Discord Developer Portal under **General Information**, set **Linked Roles Verification URL** to `https://YOUR_ENDPOINT/linked-roles`
3. Under **OAuth2**, add `https://YOUR_ENDPOINT/linked-roles/callback` as a redirect URI
4. Register the metadata schema: `GET ?register-metadata=true` (password-protected)

### Flow

1. User clicks a linked role in the server → redirected to `/linked-roles`
2. Bot generates CSRF state token, redirects to Discord OAuth2 (scopes: `role_connections.write identify` + verifier extras)
3. Discord redirects to `/linked-roles/callback` with code and state
4. Bot validates CSRF state (HMAC-SHA256, 10-minute expiry), exchanges code for tokens, fetches user, runs verifier, pushes metadata
5. User sees success page

### Built-in Verifiers

| Verifier | File | Metadata | Description |
|---|---|---|---|
| Always Verified | `always-verified.ts` | `verified` (boolean) | Always passes. Default. |
| Account Age | `account-age.ts` | `account_age_days` (integer) | Extracts creation date from Discord snowflake |
| GitHub | `github.ts` | `public_repos`, `account_age_days` | Reads Discord-linked GitHub, fetches public profile |
| Patreon | `patreon.ts` | `is_patron` (boolean) | Reads KV record populated by Patreon webhook |
| Steam | `steam.ts` | `games_owned`, `account_age_days` | Reads Discord-linked Steam, fetches via Steam API |

### Creating a Custom Verifier

```typescript
import { defineVerifier, MetadataType } from "../define-verifier.ts";
import { setVerifier } from "../routes.ts";

const myVerifier = defineVerifier({
  name: "My Verifier",
  metadata: [
    {
      key: "level",
      name: "Level",
      description: "User level must be at least this value",
      type: MetadataType.INTEGER_GREATER_THAN_OR_EQUAL,
    },
  ],
  async verify(user) {
    const level = await fetchLevelFromMyAPI(user.id);
    return {
      platformName: "My Platform",
      platformUsername: user.username,
      metadata: { level },
    };
  },
});

setVerifier(myVerifier);
```

Update the import in `services/interactions.http.ts` to point to your verifier.

### Patreon Webhook

`POST /patreon/webhook` — HMAC-MD5 signature verification via `X-Patreon-Signature` header. Rate-limited to 30 requests per 60 seconds via KV. Handles `members:create`, `members:update` (writes patron record to KV), and `members:delete` (deletes record). Extracts Discord user ID from Patreon's social connections data.

## Webhook Logging

`discord/webhook/logger.ts` — Batched Discord webhook logger.

```typescript
import { createLogger } from "../webhook/logger.ts";

const log = createLogger("my-module");
log.info("Server started");
log.warn("Rate limited");
log.error("Connection failed", error);
log.debug("Verbose detail");
```

**Configuration:** `webhookUrl`, `context` (module name), `minLevel` (default `"info"`), `batchIntervalMs` (default 2000), `maxBatchSize` (default 15), `fallbackToConsole` (default `true`).

**Behavior:** Errors flush immediately. Other levels schedule a flush after `batchIntervalMs`. On flush failure, entries are restored to the buffer (capped at 100). `finalizeAllLoggers()` flushes all registered loggers before the isolate terminates.

**Format:** `**[context]** - N log(s)` followed by `{emoji} HH:MM:SS message`

## Webhook Sending

`discord/webhook/send.ts` — Send messages and embeds to Discord webhooks.

```typescript
import { send } from "../webhook/send.ts";

await send("Hello world", webhookUrl);
await send([embed1, embed2], webhookUrl);
```

**Chunking:** Strings split at 2000 chars (breaking at newlines/spaces). Embeds batched into groups of 10 staying under 6000 total characters.

**Discord limits enforced:** Content 2000, embed title 256, description 4096, fields 25, field name 256, field value 1024, footer 2048, author name 256, total embed chars 6000, embeds per message 10.

**Rate limiting:** On 429, waits `Retry-After` (capped 10s), retries once. On 401/403/404, retries with `DISCORD_CONSOLE` fallback webhook if different.

## Command Registration

`discord/interactions/registration.ts` handles registering commands with Discord's API.

- **Global commands** — Bulk overwrite via `PUT /applications/{appId}/commands`
- **Guild commands** — Per-guild overwrite via `PUT /applications/{appId}/guilds/{guildId}/commands`

Functions: `registerGlobalCommands()`, `registerAllCommandsFromRegistry()`, `registerCommand(name)`, `registerCommandsToGuild(guildId, names?)`, `deregisterCommandFromGuild(name, guildId)`, `deregisterAllFromGuild(guildId)`, `fetchRegisteredCommands(guildId?)`.

Sequential registration calls use 100ms delays to avoid Discord rate limits.

### Discovery

`GET /?discover=true` scans the project using Val Town's `listFiles()`, finds `.ts` files in `commands/` and `components/`, and saves the manifest to KV. The registry loads this manifest on cold start to dynamically import all command and component files. Falls back to a static manifest if KV is empty.

## Helpers

### Duration Parser (`discord/helpers/duration.ts`)

```typescript
import { parseDuration } from "../../helpers/duration.ts";
parseDuration("1h30m"); // 5400000 (ms)
parseDuration("2d");    // 172800000
```

Supports `s` (seconds), `m` (minutes), `h` (hours), `d` (days), combinable. Returns `null` if invalid or exceeds 30 days.

### Embed Builder (`discord/helpers/embed-builder.ts`)

```typescript
import { embed } from "../../helpers/embed-builder.ts";

const e = embed()
  .title("Hello")
  .description("World")
  .color(0x5865f2)
  .field("Name", "Value", true)
  .footer("Footer text")
  .timestamp()
  .build();
```

Presets: `.success(desc)`, `.error(desc)`, `.info(desc)`, `.warning(desc)`.

### Crypto (`discord/helpers/crypto.ts`)

- `timingSafeEqual(a, b)` — Constant-time string comparison via HMAC to prevent timing attacks
- `secureRandomIndex(max)` — Cryptographically secure random integer in `[0, max)` using rejection sampling (no modulo bias)

### Errors (`discord/interactions/errors.ts`)

`UserFacingError` — Custom error class with a `userMessage` shown to Discord users and an optional `internalMessage` for logs. All other errors show a generic message with an 8-char interaction ID reference.

## Adding a New Command

Create a file in `discord/interactions/commands/`:

```typescript
import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "hello",
  description: "Say hello",
  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  ephemeral: false,
  async execute({ userId }) {
    return { success: true, message: `Hello <@${userId}>!` };
  },
});
```

Then use `/commands register` in Discord to register it.

### Command Options

| Property | Default | Description |
|---|---|---|
| `name` | — | Command name |
| `description` | — | Command description |
| `type` | `1` (CHAT_INPUT) | `2` for USER context menu, `3` for MESSAGE context menu |
| `registration` | — | `{ type: "global" }` or `{ type: "guild" }` |
| `deferred` | `true` | `false` for instant response, `true` for background execution |
| `ephemeral` | `true` | `false` to make responses visible to the whole channel |
| `adminOnly` | `false` | Restrict to admins (via `isGuildAdmin`) |
| `cooldown` | `3` | Seconds between uses per user |
| `options` | `[]` | Discord command options array |

### Execution Context

The `execute` function receives:

```typescript
{
  userId, guildId, channelId, interactionId, interactionToken,
  options,       // parsed options (flat or subcommand-prefixed)
  targetId,      // for context menu commands
  resolved,      // resolved users/members/channels/roles
  memberRoles,   // array of role IDs
  subcommand,    // parsed subcommand name (e.g. "admin:add")
}
```

### Response Shape

```typescript
{
  success: boolean;
  message?: string;        // text content
  embeds?: Embed[];        // Discord embeds
  components?: Component[];// action rows
  modal?: ModalData;       // open a modal (non-deferred only)
  updateMessage?: boolean; // update the original message (components only)
}
```

## Adding a Component Handler

Create a file in `discord/interactions/components/`:

```typescript
import { defineComponent } from "../define-component.ts";

export default defineComponent({
  customId: "my-button",
  match: "exact",
  type: "button",
  async execute({ userId }) {
    return { success: true, message: `Clicked by <@${userId}>!` };
  },
});
```

Match modes: `"exact"` for full `custom_id` match, `"prefix"` for prefix match (useful for dynamic IDs like `delete:123`).

## Modal Dialogs

Return a `modal` from a non-deferred command, then handle the submission with a component handler:

```typescript
// Command returns a modal
async execute() {
  return {
    success: true,
    modal: {
      title: "Feedback",
      custom_id: "feedback-modal",
      components: [
        { type: 1, components: [{ type: 4, custom_id: "topic", label: "Topic", style: 1, required: true }] },
      ],
    },
  };
}
```

```typescript
// components/feedback-modal.ts
export default defineComponent({
  customId: "feedback-modal",
  match: "exact",
  type: "modal",
  async execute({ fields }) {
    return { success: true, message: `Topic: ${fields?.topic}` };
  },
});
```

## Select Menus

Return `components` with a select menu, then handle the selection:

```typescript
// Command returns a select menu
async execute() {
  return {
    success: true,
    message: "Choose:",
    components: [{
      type: 1,
      components: [{ type: 3, custom_id: "my-select", options: [{ label: "A", value: "a" }] }],
    }],
  };
}
```

```typescript
// components/my-select.ts
export default defineComponent({
  customId: "my-select",
  match: "exact",
  type: "select",
  async execute({ values }) {
    return { success: true, updateMessage: true, message: `You picked: ${values?.[0]}` };
  },
});
```

## Pagination with Buttons

Return buttons with encoded state in the `custom_id`, then use a prefix-match handler:

```typescript
// components/my-page.ts
export default defineComponent({
  customId: "my-page:",
  match: "prefix",
  type: "button",
  async execute({ customId }) {
    const page = parseInt(customId.split(":")[1], 10);
    return { success: true, updateMessage: true, message: `Page ${page}`, components: [...] };
  },
});
```

## Project Structure

```
├── discord/
│   ├── constants.ts              # CONFIG, isGuildAdmin, EmbedColors
│   ├── discord-api.ts            # Discord API client with retry logic
│   ├── pages.ts                  # HTML pages (legal, linked roles)
│   ├── helpers/
│   │   ├── crypto.ts             # timingSafeEqual, secureRandomIndex
│   │   ├── duration.ts           # Human-readable duration parser
│   │   └── embed-builder.ts      # Fluent embed builder
│   ├── linked-roles/
│   │   ├── define-verifier.ts    # defineVerifier() helper and types
│   │   ├── oauth.ts              # Discord OAuth2 token exchange
│   │   ├── patreon-webhook.ts    # Patreon webhook handler
│   │   ├── register-metadata.ts  # Push metadata schema to Discord
│   │   ├── routes.ts             # HTTP route handlers + verifier registry
│   │   ├── state.ts              # HMAC-SHA256 CSRF state tokens
│   │   └── verifiers/
│   │       ├── account-age.ts    # Discord account age verifier
│   │       ├── always-verified.ts# Always-true verifier (default)
│   │       ├── github.ts         # GitHub profile verifier
│   │       ├── patreon.ts        # Patreon patron verifier
│   │       └── steam.ts          # Steam profile verifier
│   ├── persistence/
│   │   ├── guild-config.ts       # Per-guild config (admin roles, commands)
│   │   └── kv.ts                 # Key-value store (Val Town SQLite)
│   ├── interactions/
│   │   ├── auto-discover.ts      # File discovery, saves manifest to KV
│   │   ├── define-command.ts     # defineCommand() factory
│   │   ├── define-component.ts   # defineComponent() factory
│   │   ├── errors.ts             # UserFacingError class
│   │   ├── handler.ts            # Main interaction dispatcher
│   │   ├── manifest.ts           # Static fallback manifest
│   │   ├── patterns.ts           # Discord API constants & autocomplete
│   │   ├── registration.ts       # Command registration logic
│   │   ├── registry.ts           # Command & component registry (KV-backed)
│   │   ├── commands/
│   │   │   ├── about.ts          # Bot info
│   │   │   ├── coin-flip.ts      # Coin flip
│   │   │   ├── color-picker.ts   # Select menu demo
│   │   │   ├── commands.ts       # Admin: manage registration
│   │   │   ├── counter.ts        # Persistent counter
│   │   │   ├── echo.ts           # Echo input
│   │   │   ├── facts.ts          # Paginated facts
│   │   │   ├── feedback.ts       # Modal demo
│   │   │   ├── giveaway.ts       # Giveaway system
│   │   │   ├── help.ts           # List commands
│   │   │   ├── pick.ts           # Random picker
│   │   │   ├── ping.ts           # Health check
│   │   │   ├── poll.ts           # Poll system
│   │   │   ├── r.ts              # Dice roller
│   │   │   ├── react-roles.ts    # Self-assign role panels
│   │   │   ├── remind.ts         # Personal reminders
│   │   │   ├── schedule.ts       # Scheduled messages
│   │   │   ├── server.ts         # Guild configuration
│   │   │   ├── slow-echo.ts      # Deferred command demo
│   │   │   ├── tag.ts            # Custom text tags
│   │   │   └── user-info.ts      # User context menu
│   │   └── components/
│   │       ├── color-select.ts   # Color picker handler
│   │       ├── example-button.ts # Button demo handler
│   │       ├── facts-page.ts     # Fact pagination handler
│   │       ├── feedback-modal.ts # Feedback modal handler
│   │       ├── giveaway-enter.ts # Giveaway entry handler
│   │       ├── poll-vote.ts      # Poll vote handler
│   │       └── react-role.ts     # Role toggle handler
│   └── webhook/
│       ├── logger.ts             # Batched Discord webhook logger
│       └── send.ts               # Webhook message sending
├── services/
│   ├── interactions.http.ts      # HTTP endpoint (all routes)
│   ├── example.cron.ts           # Cron job template
│   ├── giveaways.cron.ts         # Auto-end expired giveaways
│   ├── polls.cron.ts             # Auto-end expired polls
│   ├── reminders.cron.ts         # Deliver due reminders
│   └── scheduled-messages.cron.ts# Deliver due scheduled messages
└── test/
    └── _mocks/                   # Test infrastructure mocks
```

## License

This project is licensed under the [MIT License](LICENSE).
