# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server exposing time, timezone, and duration tools. It ships **two entry points from one codebase**: a Node binary (stdio + httpStream) and a Cloudflare Worker.

Built on [somamcp](https://github.com/sapientsai/SomaMCP) `^1.2.0`, which provides the MCP backend abstraction, telemetry, and health/introspection surfaces for both runtimes.

## Development Commands

```bash
pnpm validate        # format + lint + typecheck + test + build (run before commits)
pnpm test            # Vitest
pnpm check:worker    # verify the worker bundle contains no Node built-ins

pnpm start           # stdio server (dist/node.js)
pnpm start:http      # HTTP on :3333/mcp
pnpm cf:dev          # local workerd via wrangler
pnpm cf:deploy       # deploy to Cloudflare
```

Run a single test: `pnpm test -- test/clock.spec.ts`

## Architecture

```
src/
  clock.ts    pure time logic — Either<TemporalError, T>
  tools.ts    MCP tool registration (runtime-agnostic)
  index.ts    library surface
  node.ts     entry: somamcp      -> stdio + httpStream
  worker.ts   entry: somamcp/edge -> export default { fetch }
```

### The rule that keeps both runtimes working

**`src/index.ts`, `src/clock.ts`, and `src/tools.ts` must never import a Node built-in**, directly or transitively. They are shared by both entry points; anything Node-only in them breaks the Worker.

- `src/node.ts` may use `process` and Node APIs.
- `src/worker.ts` must import from **`somamcp/edge`**, never `somamcp`. The root barrel re-exports `createJsonFileTelemetry` / `imageContent` / `audioContent`, which import `node:fs`.

`pnpm check:worker` enforces this by walking the import graph from `dist/worker.js` and failing on any `node:` specifier, bare Node built-in (`fs`, `crypto`, `path`…), or root `somamcp` import. It follows the graph rather than matching filenames because the bundler hoists shared code into a chunk with a generated name — a glob would miss it.

### Error handling

Fallible functions in `clock.ts` return `Either<TemporalError, T>` (functype); they never throw. `tools.ts` folds a `Left` into an MCP error result carrying both the message and an actionable hint.

On the edge runtime somamcp converts `isError` results into real JSON-RPC errors — `EdgeFastMCP` drops the `isError` flag, so returning it alone would make failures look like successes.

### Adding a tool

1. Add pure logic to `src/clock.ts`, returning `Either`.
2. Register it in `registerTemporalTools` in `src/tools.ts`, folding errors with `err`.
3. Cover the logic in `test/clock.spec.ts` and the wire behaviour in `test/worker.spec.ts`.

Both entry points pick it up automatically — never register a tool in `node.ts` or `worker.ts`.

## Deployment

Live at **`https://time.somamcp.com/mcp`** (custom domain on the `temporal-mcp-server` Worker); the `*.workers.dev` URL still resolves. Health: `https://time.somamcp.com/health`.

Deploys go through **Cloudflare Workers Builds**, not GitHub Actions. Cloudflare connects to the repo via its own GitHub App, so there is no `CLOUDFLARE_API_TOKEN` in GitHub secrets — do not add one, and do not add a deploy workflow alongside it. Two paths deploying the same Worker is worse than either alone.

The dashboard's deploy command is `pnpm cf:deploy`, which is `pnpm build && wrangler deploy`. `pnpm build` runs `check:worker`, so the edge-safety gate lives in the repo rather than in a dashboard field. Keep it that way: if the deploy needs a new gate, add it to the `build` or `cf:deploy` script, not to the Cloudflare UI.

`cf:deploy` is `pnpm build && node scripts/deploy.mjs`. The script forwards `GIT_COMMIT`, `GIT_BRANCH`, and `BUILD_DATE` as Worker vars — Workers Builds' own `WORKERS_CI_*` variables exist only during the build and are invisible at runtime, so without forwarding them `info` reports an empty build. Local deploys fall back to `git rev-parse` and mark a dirty tree as `<sha>-dirty`.

`npm publish` is separate and still runs from `.github/workflows/publish.yml` on `v*` tags.

## .mcp.json

A checked-in `.mcp.json` registers `dist/node.js` as the `temporal` server, so a session in this repo exercises local changes rather than the hosted instance. It needs `pnpm build` first. Leave it pointing at the local build — switching it to the hosted URL would silently test production instead of the working tree.

## Cloudflare Notes

- `nodejs_compat` is intentionally **off**. A Node built-in reaching the bundle should fail the build, not get shimmed.
- The `alias` block in `wrangler.jsonc` points three optional schema libraries (valibot/effect/sury, probed by the transitive `xsschema`) at `cf/empty-module.js`. Only zod is actually used; the aliases exist so esbuild can resolve the dead dynamic imports.
- The Worker builds its server lazily on first request and reuses it. Workers forbids network I/O at module scope, and Hono seals its router after the first request — so all tool/route registration happens during that one construction.
- Set `MCP_AUTH_TOKEN` (via `wrangler secret put`) to require a bearer token on `/mcp`. Unset means public.

## Testing

- `test/clock.spec.ts` — pure logic: DST boundaries, leap years, month clamping, duration parsing.
- `test/worker.spec.ts` — real `Request` objects through the Worker's `fetch` handler over MCP JSON-RPC, including error paths.

When touching time logic, keep the DST and month-clamping cases: `America/New_York` must report `-04:00` in August and `-05:00` in January, and `2026-01-31 + P1M` must be `2026-02-28`.
