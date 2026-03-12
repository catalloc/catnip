# Contributing to Catnip

Thanks for your interest in contributing! Catnip is a Discord bot template built for Val Town's serverless Deno runtime.

## Getting Started

1. Fork and clone the repository
2. Copy `.env.example` to `.env` and fill in your Discord application credentials
3. Install [Deno](https://deno.land) if you don't have it

## Running Tests

```bash
deno test --allow-env --allow-net --no-check
```

All 1621 tests across 126 files should pass. Tests use mock modules for SQLite, blob storage, and Val Town utilities (see `test/_mocks/`). See the [README](README.md#testing) for a full coverage breakdown.

## Adding a Command

1. Create a new file in `discord/interactions/commands/`
2. Use `defineCommand()` to declare the command and its handler
3. Register the component handler if needed in `discord/interactions/components/`
4. Run discover + register via the admin endpoints

See the [README](README.md#adding-a-new-command) for a full walkthrough with examples.

## Code Style

- TypeScript with Deno conventions
- No external dependencies beyond Val Town standard libraries and Deno std
- Use `UserFacingError` for errors shown to Discord users
- Use `createLogger()` instead of `console.log` for production logging
- Parameterize all SQL queries — never interpolate user input
- Use `kv.update()` or `kv.claimUpdate()` for atomic mutations

## Pull Requests

- Keep changes focused — one feature or fix per PR
- Include tests for new commands or behavior changes
- Make sure all existing tests still pass
- Update the README if you add commands, env vars, or endpoints

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce (if applicable)

For security vulnerabilities, see [SECURITY.md](SECURITY.md).
