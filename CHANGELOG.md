# Changelog

## 1.0.2 — Webhook Log Muting, Command Rename & Daily Rewards

### Features
- Webhook log muting — `/server logging mute <path>` suppresses routine (info/debug) webhook logs for noisy commands or cron jobs while still forwarding warnings and errors. Supports prefix matching (e.g. muting `cmd:games` also mutes `cmd:games:coinflip`). Manage with `mute`, `unmute`, and `list` subcommands.
- `/server info` now shows muted log paths alongside admin roles and enabled commands
- Per-game toggles — admins can enable/disable individual games via `/games-config toggle --game <name> --enabled <bool>` (all 20 games supported)
- Daily reward command — `/games daily` grants a random coin amount (default 50–150) with a 24-hour cooldown
- Daily reward configuration — `/games-config daily` lets admins set `--enabled`, `--min`, `--max` reward range
- `games-config info` now shows disabled games list and daily reward settings
- Added `GameName` type and `ALL_GAME_NAMES` constant for type-safe game references

### Changes
- Renamed `/r` to `/roll` for clarity
- Moved `/daily` into `/games daily` subcommand — consolidates all game interactions under one command
- Logger `muted` flag integrated into interaction handler (commands) and `runCron()` helper (cron jobs)

### Testing
- New tests for `log-config.ts`, server logging subcommands, toggle, daily config, daily command, and per-game disable enforcement

## 1.0.1 — Extract Reusable Patterns

### Refactoring
- Extract `ExpiringCache` class (`discord/helpers/cache.ts`) — replaces 6 identical cache implementations across paste, template, tag, stash, backup, and schedule commands
- Extract permission helpers (`discord/helpers/permissions.ts`) — `checkEntityAccess()` replaces `canGet`/`canSend`/`canView`, blob/KV CRUD helpers replace 12 duplicated allow/deny handlers
- Extract format helpers (`discord/helpers/format.ts`) — `formatPermissionInfo()` and `discordTimestamp()` replace duplicated formatting blocks
- Extract cron helpers (`discord/helpers/cron.ts`) — `runCron()` wraps common cron lifecycle, `deliverWithRetry()` wraps claim-delete + retry pattern
- Refactor paste, template, tag, stash, backup, schedule commands to use shared helpers
- Refactor reminders, scheduled-messages, giveaways, polls, tickets cron jobs to use shared helpers
- Add 45 new tests for helper modules; all 672 tests pass

## 1.0.0 — Initial Public Release

### Features
- Slash command framework with `defineCommand()`, auto-registration, subcommands, autocomplete, and cooldowns
- Component handling for buttons, select menus, and modals via `defineComponent()`
- Context menu commands (user and message right-click)
- Per-guild configuration — admin roles, command enable/disable, persisted in KV
- Giveaway system — button entry, auto-end via cron, winner picking, reroll
- Poll system — button voting with live counts, auto-end, vote switching
- Reminders — personal time-delayed reminders with exactly-once cron delivery
- Scheduled messages — admin-only delayed message posting
- Ticket system — thread-based support tickets with close reasons, join requests, modal creation, and auto-expiry via cron
- React-roles — self-assignable role panels with button toggling
- Tags — per-guild text snippets with role/user-gated viewing
- Templates — reusable embed builder with modal editing, role/user-based send permissions, and channel posting
- Paste — server pastebin with short codes, public/private retrieval, role/user-gated access, and creator/admin delete
- Stash — personal cross-server clipboard with named snippets
- Backup — admin-only guild data export/import for tags, templates, and counters
- Dice roller — standard TTRPG notation (`2d20+5`) with secret rolls, announce, and reveal
- Linked roles — Discord OAuth2 verification with pluggable verifiers (Steam, GitHub, Patreon, account age)
- Webhook logging — batched Discord webhook logger with log levels and auto-flush
- Webhook sending — message chunking, embed batching, rate-limit handling, fallback support
- KV persistence — SQLite-backed key-value store with atomic operations, optimistic concurrency, and time-based queries
- Blob persistence — Cloudflare R2-backed storage for larger data (pastes, templates, backups, stash)
- Guild allowlist via `ALLOWED_GUILD_IDS`
- Built-in Terms of Service and Privacy Policy pages
- Health check endpoint

### Testing
- **529 tests** across **51 files** with 100% pass rate
- Full coverage across commands, components, persistence, crons, linked roles, and webhooks
- Offline test infrastructure with mocks for SQLite, blob storage, fetch, env, signing, and Val Town utilities

### Security
- Ed25519 signature verification on all interactions
- HMAC-SHA256 CSRF tokens for OAuth2 flow
- Timing-safe comparisons for all secret validation
- Parameterized SQL queries throughout
- Explicit null defaults for optional secrets
- Rate limiting and per-user command cooldowns
- Exactly-once cron delivery via atomic `claimDelete()`
- Retry with exponential backoff respecting Discord rate limits
