# Discord Bot Seed for Val Town

A clean, general-purpose Discord bot template built for [Val Town](https://val.town). Provides slash command handling, webhook messaging, and structured logging out of the box.

## Features

- **Slash command framework** - Define commands with `defineCommand()`, auto-registered to Discord
- **Interaction handler** - Native Ed25519 signature verification, subcommand parsing, fast/deferred command routing
- **Component & modal handling** - Auto-discovered handlers for buttons, selects, and modals via `defineComponent()`
- **Context menu commands** - User and message context menu support with resolved data
- **Webhook messaging** - Send text and embeds with chunking, rate-limit handling, and fallback support
- **Structured logging** - Batched Discord webhook logger with log levels
- **Admin commands** - Built-in `/commands register` and `/commands unregister` for managing bot commands via Discord
- **Command cooldowns** - Per-user cooldowns with configurable duration
- **Health check** - GET endpoint returns `{ status: "ok" }` for monitoring
- **Legal pages** - Built-in Terms of Service (`/terms`) and Privacy Policy (`/privacy`) served from the interactions endpoint
- **Persistence** - Minimal KV store wrapping Val Town SQLite

## Quick Start

1. **Fork this project** on Val Town
2. **Create a Discord application** at [discord.com/developers](https://discord.com/developers/applications)
3. **Set environment variables** (see below)
4. **Set the Interactions Endpoint URL** in your Discord app settings to your Val Town HTTP endpoint URL (the `interactions.http.ts` val)
5. **Run `/commands register`** in your Discord server to register the bot's commands

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_APP_ID` | Yes | Discord application ID |
| `DISCORD_PUBLIC_KEY` | Yes | Discord public key (for signature verification) |
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_GUILD_ID` | Yes | Your Discord server (guild) ID |
| `DISCORD_APP_OWNER_ID` | No | Your Discord user ID (for admin command access) |
| `DISCORD_ADMIN_ROLE_ID` | No | Role ID authorized for admin commands |
| `DISCORD_CONSOLE` | No | Webhook URL for logger output |
| `DISCORD_CLIENT_SECRET` | No | Discord client secret (required for Linked Roles) |
| `ADMIN_PASSWORD` | No | Password for admin endpoints (`?discover`, `?register`) |

## Adding a New Command

1. Create a new file in `discord/interactions/commands/`:

```typescript
// discord/interactions/commands/hello.ts
import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "hello",
  description: "Say hello",
  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  ephemeral: false, // visible to the whole channel (default: true)
  async execute({ userId }) {
    return { success: true, message: `Hello <@${userId}>!` };
  },
});
```

2. Use `/commands register` in Discord to register the new command.

## Context Menu Commands

Create a user or message context menu command by setting `type: 2` (USER) or `type: 3` (MESSAGE):

```typescript
// discord/interactions/commands/user-info.ts
import { defineCommand } from "../define-command.ts";

export default defineCommand({
  name: "User Info",
  description: "",
  type: 2, // USER context menu
  registration: { type: "guild", servers: ["MAIN"] },
  deferred: false,
  async execute({ targetId, resolved }) {
    const user = resolved?.users?.[targetId!];
    return { success: true, message: `User: ${user?.username}` };
  },
});
```

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

## Adding a Component Handler

1. Create a new file in `discord/interactions/components/`:

```typescript
// discord/interactions/components/my-button.ts
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

Component handlers are auto-discovered. Match modes: `"exact"` for full custom_id match, `"prefix"` for prefix match (useful for dynamic IDs like `delete:123`).

## Ephemeral vs Public Responses

By default, command responses are **ephemeral** (only visible to the invoker). Set `ephemeral: false` to make a command's response visible to the whole channel:

```typescript
export default defineCommand({
  name: "coin-flip",
  ephemeral: false, // everyone in the channel sees the result
  // ...
});
```

## Cooldowns

Add a `cooldown` property (in seconds) to any command definition:

```typescript
export default defineCommand({
  name: "my-command",
  cooldown: 10, // 10 seconds between uses per user
  // ...
});
```

## Tags

Custom text snippets stored per-guild. Anyone can view tags; adding, editing, and removing requires admin permissions.

**Subcommands:**
- `view <name>` — Display a tag's content (autocomplete on name)
- `add <name> <content>` — Create a new tag (admin-only, max 50 per guild)
- `edit <name> <content>` — Update an existing tag (admin-only)
- `remove <name>` — Delete a tag (admin-only)
- `list` — Show all available tag names

**Example:**
1. Create a tag: `/tag add name:rules content:Please read #rules before posting.`
2. View it: `/tag view name:rules`
3. Anyone can view, only admins can manage.

## Giveaways

Admin-only giveaway system with button entry. One active giveaway per guild.

**Subcommands:**
- `create <prize> <duration> <channel> [winners]` — Start a giveaway (posts panel with Enter button)
- `end` — End the current giveaway early and pick winners
- `reroll` — Pick new winner(s) from the ended giveaway's entrants

**Example:**
1. Create: `/giveaway create prize:Nitro duration:1d channel:#giveaways winners:2`
2. Users click "Enter Giveaway" button on the panel
3. End early or let the cron job end it automatically
4. Reroll if needed: `/giveaway reroll`

**Cron:** Schedule `services/giveaways.cron.ts` to run every 1-5 minutes to auto-end expired giveaways.

## Reminders

Personal reminders delivered as channel messages. Open to all users.

**Usage:** `/remind duration:1h message:Check the oven`

- Duration supports: `s` (seconds), `m` (minutes), `h` (hours), `d` (days), and combinations like `1d12h`
- Maximum 10 active reminders per user
- Maximum duration: 30 days
- Reminder is posted to the channel where the command was used

**Cron:** Schedule `services/reminders.cron.ts` to run every 1-5 minutes to deliver due reminders.

## Polls

Admin-only button-based polls. One active poll per guild.

**Subcommands:**
- `create <question> <options> <channel> [duration]` — Start a poll (options are comma-separated, 2–10 choices)
- `end` — End the active poll and show final results

**Example:**
1. Create: `/poll create question:Fav color? options:Red,Blue,Green channel:#general duration:1h`
2. Users click buttons to vote (click again to remove, click different to switch)
3. End early with `/poll end` or let the cron auto-end it
4. Omit `duration` for a poll with no time limit

**Cron:** Schedule `services/polls.cron.ts` to run every 1-5 minutes to auto-end expired polls.

## Scheduled Messages

Admin-only time-delayed message delivery.

**Subcommands:**
- `send <channel> <time> <message>` — Schedule a message (e.g. `time:2h`)
- `list` — Show pending scheduled messages for this guild
- `cancel <id>` — Cancel a pending message (autocomplete on id)

**Example:**
1. Schedule: `/schedule send channel:#announcements time:30m message:Server maintenance starting now!`
2. Check pending: `/schedule list`
3. Cancel if needed: `/schedule cancel` (autocomplete shows pending messages)
4. Maximum 25 scheduled messages per guild

**Cron:** Schedule `services/scheduled-messages.cron.ts` to run every 1-5 minutes to deliver due messages.

## Dice Roller

Roll dice using standard TTRPG notation. Open to all users.

**Usage:** `/r dice:2d20+5`

- Supports standard notation: `XdN`, `XdN+M`, `XdN-M`
- 1–20 dice per roll, d2–d100
- Shows individual rolls and total with modifier breakdown

**Examples:**
- `/r dice:1d20` → single d20 result
- `/r dice:4d6` → roll 4d6, shows each roll + total
- `/r dice:2d20+5` → roll 2d20, add 5 to total
- `/r dice:1d2` → coin flip (1 or 2)

## React-Roles

Self-assignable role panels with button-based toggling.

**Setup:**
1. Add roles: `/react-roles add role:@Gamer emoji:🎮 label:Gamer`
2. Repeat for up to 25 roles
3. Send the panel: `/react-roles send channel:#roles`
4. Users click buttons to self-assign/remove roles

**Subcommands:**
- `add <role> <emoji> <label>` — Add a role to the panel
- `remove <role>` — Remove a role from the panel
- `list` — Show current configuration
- `send <channel>` — Post or update the role panel
- `clear` — Delete all configuration

The panel is a non-ephemeral message with an embed and buttons. Clicking a button toggles the role (add if missing, remove if present). Re-running `send` updates the existing panel message instead of creating a duplicate.

## Persistence

A minimal KV store wrapping Val Town SQLite is available:

```typescript
import { kv } from "../../persistence/kv.ts";

await kv.set("user:123", { score: 42 });
const data = await kv.get<{ score: number }>("user:123");
await kv.delete("user:123");
const all = await kv.list("user:");
```

## Linked Roles

Discord's [Linked Roles](https://discord.com/developers/docs/tutorials/configuring-app-metadata-for-linked-roles) feature lets server admins gate roles behind external verification. This template includes a ready-to-use framework with a `defineVerifier()` pattern.

**Setup:**

1. Set the `DISCORD_CLIENT_SECRET` environment variable
2. In the Discord Developer Portal, under **General Information**, set the **Linked Roles Verification URL** to `https://YOUR_ENDPOINT/linked-roles`
3. Under **OAuth2**, add `https://YOUR_ENDPOINT/linked-roles/callback` as a redirect URI
4. Register the metadata schema: `GET ?register-metadata=true` (password-protected)

**How it works:**

1. User clicks a linked role in the server → redirected to `/linked-roles`
2. Bot redirects to Discord OAuth2 consent (scopes: `role_connections.write identify`)
3. After consent, Discord redirects to `/linked-roles/callback`
4. Bot exchanges the code for tokens, fetches user info, runs the verifier, pushes metadata
5. User sees a success page and the linked role is applied

**Creating a custom verifier:**

```typescript
// discord/linked-roles/verifiers/my-verifier.ts
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

Then update the import in `services/interactions.http.ts` to point to your verifier instead of `always-verified.ts`.

## Admin Endpoints

The `?discover`, `?register`, and `?register-metadata` endpoints require the `ADMIN_PASSWORD` env var to be set. Pass the password via an `Authorization` header (preferred) or query parameter (legacy):

```
# Preferred: Authorization header
GET ?discover=true            with header  Authorization: Bearer YOUR_PASSWORD
GET ?register=true            with header  Authorization: Bearer YOUR_PASSWORD
GET ?register-metadata=true   with header  Authorization: Bearer YOUR_PASSWORD

# Legacy: query parameter (not recommended — visible in logs)
GET ?discover=true&password=YOUR_PASSWORD
GET ?register=true&password=YOUR_PASSWORD
GET ?register-metadata=true&password=YOUR_PASSWORD
```

## Terms of Service & Privacy Policy

The interactions endpoint serves built-in legal pages at:

- `/terms` — Terms of Service
- `/privacy` — Privacy Policy

Set these URLs in your Discord application settings under **General Information**. The pages are styled, cross-linked, and served directly from the interactions endpoint — no additional vals needed.

To customize the content, edit `discord/pages.ts`.

## Health Check

Send a GET request to the interactions endpoint to check if the bot is running (no auth required):

```
GET /interactions -> { "status": "ok", "timestamp": "..." }
```

## Project Structure

```
├── discord/
│   ├── constants.ts              # Centralized CONFIG, env validation, embed colors
│   ├── discord-api.ts            # Discord Bot API fetch helper
│   ├── pages.ts                  # HTML pages (legal, linked roles)
│   ├── linked-roles/
│   │   ├── define-verifier.ts    # defineVerifier() helper and types
│   │   ├── state.ts              # HMAC-SHA256 CSRF state tokens
│   │   ├── oauth.ts              # Discord OAuth2 (user Bearer tokens)
│   │   ├── routes.ts             # HTTP route handlers + verifier registry
│   │   ├── register-metadata.ts  # Push metadata schema to Discord
│   │   └── verifiers/
│   │       └── always-verified.ts # Example verifier (always true)
│   ├── persistence/
│   │   └── kv.ts                 # Key-value store (Val Town SQLite)
│   ├── helpers/
│   │   ├── duration.ts          # Human-readable duration parser
│   │   └── embed-builder.ts      # Fluent embed builder
│   ├── interactions/
│   │   ├── auto-discover.ts     # File discovery helper
│   │   ├── define-command.ts     # defineCommand() helper and types
│   │   ├── define-component.ts   # defineComponent() helper and types
│   │   ├── errors.ts            # UserFacingError class
│   │   ├── handler.ts           # Main interaction handler
│   │   ├── patterns.ts          # Discord API constants & autocomplete
│   │   ├── registration.ts      # Command registration logic
│   │   ├── registry.ts          # Unified command & component registry
│   │   ├── commands/
│   │   │   ├── about.ts         # Bot info command
│   │   │   ├── coin-flip.ts     # Coin flip command
│   │   │   ├── color-picker.ts  # Select menu demo
│   │   │   ├── commands.ts      # Admin: manage registration
│   │   │   ├── counter.ts       # KV persistence demo
│   │   │   ├── echo.ts          # Echo command
│   │   │   ├── facts.ts         # Pagination demo
│   │   │   ├── feedback.ts      # Modal demo
│   │   │   ├── giveaway.ts      # Giveaway system (admin)
│   │   │   ├── help.ts          # List available commands
│   │   │   ├── poll.ts          # Poll system (admin)
│   │   │   ├── pick.ts          # Random picker
│   │   │   ├── ping.ts          # Health check command
│   │   │   ├── r.ts             # Dice roller
│   │   │   ├── react-roles.ts   # React-roles panel admin command
│   │   │   ├── remind.ts        # Personal reminders
│   │   │   ├── schedule.ts     # Scheduled messages (admin)
│   │   │   ├── slow-echo.ts     # Deferred command example
│   │   │   ├── tag.ts           # Custom text tags
│   │   │   └── user-info.ts     # Context menu demo
│   │   └── components/
│   │       ├── color-select.ts       # Select menu handler
│   │       ├── example-button.ts     # Button handler
│   │       ├── facts-page.ts        # Pagination handler
│   │       ├── feedback-modal.ts     # Modal handler
│   │       ├── giveaway-enter.ts     # Giveaway entry button handler
│   │       ├── poll-vote.ts         # Poll vote button handler
│   │       └── react-role.ts        # React-role toggle handler
│   └── webhook/
│       ├── send.ts              # Webhook message sending
│       └── logger.ts            # Discord webhook logger
└── services/
    ├── interactions.http.ts     # HTTP endpoint for Discord interactions
    ├── example.cron.ts          # Cron job with webhook example
    ├── giveaways.cron.ts        # Auto-end expired giveaways
    ├── polls.cron.ts            # Auto-end expired polls
    ├── reminders.cron.ts        # Deliver due reminders
    └── scheduled-messages.cron.ts # Deliver due scheduled messages
```

## License

This project is licensed under the [MIT License](LICENSE).
