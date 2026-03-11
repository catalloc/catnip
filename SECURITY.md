# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Catnip, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **catalloc** (see GitHub profile) with a description of the vulnerability
3. Include steps to reproduce if possible

You should receive an acknowledgment within 48 hours. Fixes for confirmed vulnerabilities will be released as soon as practical.

## Security Practices

Catnip implements the following security measures:

- **Ed25519 signature verification** on all Discord interactions
- **HMAC-SHA256 state tokens** with 10-minute expiry for OAuth2 CSRF protection
- **Timing-safe comparisons** for all secret/token validation (prevents timing attacks)
- **Parameterized SQL queries** throughout the KV layer (prevents injection)
- **Mention sanitization** to prevent `@everyone`/`@here` abuse
- **Content-Security-Policy**, **X-Frame-Options**, and **X-Content-Type-Options** headers on HTML pages
- **Explicit null defaults** for optional secrets — features fail loudly instead of operating with empty credentials
- **Rate limiting** on Patreon webhooks and per-user command cooldowns
- **Exactly-once delivery** for cron jobs via atomic `claimDelete()` operations
- **Retry with exponential backoff** for Discord API calls, respecting `429 Retry-After`
- **30-second request timeouts** on all outbound HTTP calls
- **Guild allowlist** support via `ALLOWED_GUILD_IDS`

## Environment Variables

All secrets are read from environment variables at runtime — nothing is hardcoded. See `.env.example` for the full list. Required variables cause the bot to fail at startup if missing.
