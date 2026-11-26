# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP (Model Context Protocol) server for the **Oura Ring API v2**. It exposes a single
consolidated `oura_data` tool that covers every Oura `usercollection` endpoint, so an MCP client
can query sleep, readiness, activity, heart rate, workouts, etc. from the user's Oura data.

Built in the style of `dokploy-mcp-server`: one action/collection-parameterized tool (minimal token
footprint) on top of [`somamcp`](https://github.com/sapientsai/SomaMCP), with [`functype`](https://functype.org)
for typed error handling and `zod` for parameter validation.

## Development Commands

Commands delegate to the `ts-builds` toolchain (ESM output via tsdown).

```bash
pnpm validate     # format + lint + typecheck + test + build (run before commits)
pnpm run ci       # validate's checks without fixing, as CI runs them (type `run`: `pnpm ci` is a clean install)
pnpm dev          # watch build (outputs to lib/)
pnpm build        # production build (outputs to dist/)
pnpm test         # vitest run
pnpm test:watch
pnpm typecheck
pnpm inspect      # run dist/index.js against @modelcontextprotocol/inspector
```

Run a single test file: `pnpm test -- test/client.spec.ts`.

> Note: pnpm 11's pre-run deps check requires build-script decisions to be acknowledged in
> `pnpm-workspace.yaml` under `allowBuilds:` (e.g. `tldjs: false`). If you add a dependency whose
> install prints `ERR_PNPM_IGNORED_BUILDS`, add it there.

## Architecture

Entry point `src/index.ts`:

1. `parseConfig(process.env)` → `Either<string, OuraConfig>` (fails fast with a stderr message + exit 1).
2. `createServer(...)` from `somamcp` with telemetry + introspection.
3. `server.addTool(createOuraDataTool(config))`.
4. `server.start(...)` on `stdio` (default) or `httpStream`.

### Source layout

- `src/config.ts` — env → `OuraConfig` (Either). Resolves an `AuthConfig`: `oauth` when
  `OURA_CLIENT_ID`/`OURA_CLIENT_SECRET` are set (preferred), else `pat` via `OURA_API_KEY` (legacy
  fallback — Oura stopped issuing new PATs in Dec 2025). `OURA_SANDBOX` switches the base URL to
  Oura's `/sandbox/` demo data.
- `src/oura/auth.ts` — `TokenProvider` abstraction producing the Bearer token. Static for PAT; for
  OAuth, refreshes with single-flight + persist-before-use against a token store
  (`~/.config/oura-ring-mcp/tokens.json`). Oura refresh tokens are single-use/rotating, so the store
  is the source of truth — never the env. Also exports `exchangeAuthCode`/`writeTokenStore`.
- `src/login.ts` — the `login` subcommand: browser consent → localhost one-shot callback (CSRF
  `state`) → authorization-code exchange → writes the token store.
- `src/oura/collections.ts` — the descriptor table: every collection's `kind`
  (`daily` | `datetime` | `listOnly` | `singleton`), whether it has a by-id route, and whether it
  supports `latest`. **Source of truth is Oura's OpenAPI spec** (`openapi-1.35.json`); update this
  table when Oura publishes a newer version.
- `src/oura/params.ts` — the `zod` schema for `oura_data`, with a `superRefine` enforcing which
  params are legal per collection (returns LLM-actionable messages).
- `src/oura/client.ts` — `buildUrl` (pure; takes an injected `now` for deterministic default ranges)
  and `requestOura` (native `fetch` → `Either<OuraError, unknown>`; never throws on network/HTTP/parse).
- `src/tools/ouraData.ts` — the `oura_data` tool; folds the `Either` to a JSON string or throws
  `somamcp.UserError` (which somamcp classifies for the client).
- `src/telemetry.ts` — composite telemetry. **Defaults to no-op**: under stdio, stdout is the
  JSON-RPC channel, so console telemetry is only enabled under `httpStream`. NDJSON file telemetry
  is opt-in via `OURA_TELEMETRY_FILE`.

### Conventions

- Prefer `functype` `Either` over throwing for expected failures (config, HTTP). Only throw
  `UserError` at the tool boundary.
- Keep `buildUrl` pure and clock-injectable so URL construction stays unit-testable.
- Response bodies are returned as raw Oura JSON — do not reshape them.

## Testing

Vitest in `test/*.spec.ts`. `requestOura` is tested with an injected `fetchFn` mock and a fixed
`now`; no live network calls in CI. Set `OURA_SANDBOX=true` for manual testing against Oura's demo
dataset without a physical ring.

## Publishing

Publishing is automated: pushing a `v*` tag triggers `.github/workflows/publish.yml`, which runs
`pnpm validate` and `npm publish --provenance` via npm OIDC trusted publishing (needs Node 24+,
pinned in `.nvmrc`).
