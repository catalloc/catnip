# Changelog

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
- Tags — per-guild text snippets with admin management
- Dice roller — standard TTRPG notation (`2d20+5`) with secret rolls, announce, and reveal
- Linked roles — Discord OAuth2 verification with pluggable verifiers (Steam, GitHub, Patreon, account age)
- Webhook logging — batched Discord webhook logger with log levels and auto-flush
- Webhook sending — message chunking, embed batching, rate-limit handling, fallback support
- KV persistence — SQLite-backed key-value store with atomic operations, optimistic concurrency, and time-based queries
- Guild allowlist via `ALLOWED_GUILD_IDS`
- Built-in Terms of Service and Privacy Policy pages
- Health check endpoint

### Testing
- **408 tests** across **46 files** with 100% pass rate
- Full coverage across commands, components, persistence, crons, linked roles, and webhooks
- Offline test infrastructure with mocks for SQLite, fetch, env, signing, and Val Town utilities

### Security
- Ed25519 signature verification on all interactions
- HMAC-SHA256 CSRF tokens for OAuth2 flow
- Timing-safe comparisons for all secret validation
- Parameterized SQL queries throughout
- Explicit null defaults for optional secrets
- Rate limiting and per-user command cooldowns
- Exactly-once cron delivery via atomic `claimDelete()`
- Retry with exponential backoff respecting Discord rate limits
