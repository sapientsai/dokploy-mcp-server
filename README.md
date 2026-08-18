# temporal-mcp-server

[![npm version](https://img.shields.io/npm/v/temporal-mcp-server.svg)](https://www.npmjs.com/package/temporal-mcp-server)

MCP server for time, timezone, and duration tools.

Run it **locally over stdio** (Claude Desktop, Claude Code, any local MCP client), **locally over HTTP**, or use the **hosted instance** — same tools, same code, three ways to run it.

A public instance runs on Cloudflare Workers at **`https://time.somamcp.com/mcp`**:

```bash
claude mcp add --transport http temporal https://time.somamcp.com/mcp
```

Built on **somamcp** ([README](https://github.com/sapientsai/SomaMCP#readme) · [npm](https://www.npmjs.com/package/somamcp)), which supplies the MCP plumbing, telemetry, and health/introspection endpoints for both runtimes. Time logic is pure and functional, using [functype](https://github.com/jordanburke/functype).

## Tools

| Tool               | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `get_current_time` | Current time as epoch, UTC ISO-8601, and wall-clock in any IANA timezone    |
| `convert_timezone` | Render an ISO-8601 timestamp in a target timezone                           |
| `add_duration`     | Add or subtract an ISO-8601 duration, with calendar-aware month arithmetic  |
| `time_between`     | Elapsed time between two timestamps, in whole units plus a readable summary |

`somamcp` also registers an `info` tool and `/health`, `/health/detail`, `/info`, and `/dashboard` endpoints.

### Behaviour worth knowing

**Date units are calendar units; time units are exact.** This is the distinction that makes DST come out right, and it follows ISO-8601 and [Temporal](https://tc39.es/proposal-temporal/docs/duration.html):

| Across US "fall back"              | Result                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| `2026-11-01T00:00-04:00` + `P1D`   | `2026-11-02T00:00` — same wall clock next day (25 real hours) |
| `2026-11-01T00:00-04:00` + `PT24H` | `2026-11-01T23:00` — exactly 24 hours                         |

Both are correct, and they differ. "Tomorrow" is a calendar idea; "24 hours from now" is a physical one.

**`timezone` governs the arithmetic, not just the rendering.** Calendar units are applied to that zone's wall clock, so `add_duration` in `America/New_York` behaves the way a person in New York expects.

**Month arithmetic clamps rather than overflows.** `P1M` on `2026-01-31` returns `2026-02-28`, not `2026-03-03`.

**Offsets are resolved per instant, not per zone.** `America/New_York` reports `-04:00` in August and `-05:00` in January. DST comes from the runtime's tz database, so there is no offset table here to go stale.

**Naive timestamps are read in the supplied timezone.** `2026-11-01T00:00:00` with `America/New_York` means midnight in New York. It never falls back to the host's zone — that would answer differently on a laptop than on a Worker.

**Timestamp parsing is strict.** Only ISO-8601 forms are accepted; `17 Aug 2026` is rejected with a hint. `new Date()` would have taken it and resolved it against whatever zone the process happened to run in.

**Elapsed components share one sign.** `time_between` returns all of `days`/`hours`/`minutes`/`seconds` negative for a backward interval, so summing them is correct, plus a `direction` of `past`/`future`/`same`.

**Errors carry a hint.** An unknown timezone returns the bad value _and_ the expected format, so a calling agent can correct itself instead of guessing again.

## Running as a local MCP server

Stdio is the default and the mode local clients expect. Nothing is hosted, nothing listens on a port — your client launches the process and talks to it over stdin/stdout.

### Claude Code

```bash
claude mcp add temporal -- npx -y temporal-mcp-server
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "temporal": {
      "command": "npx",
      "args": ["-y", "temporal-mcp-server"]
    }
  }
}
```

On macOS that file lives at `~/Library/Application Support/Claude/claude_desktop_config.json`; on Windows, `%APPDATA%\Claude\claude_desktop_config.json`. Restart Claude Desktop after editing it.

### Running from a clone

If you'd rather not go through npm:

```bash
pnpm install
pnpm build
pnpm start          # stdio
```

Then point your client at the built entry point:

```bash
claude mcp add temporal -- node /absolute/path/to/temporal-mcp-server/dist/node.js
```

```json
{
  "mcpServers": {
    "temporal": {
      "command": "node",
      "args": ["/absolute/path/to/temporal-mcp-server/dist/node.js"]
    }
  }
}
```

The package also installs a `temporal-mcp-server` binary, so a global install (`npm i -g temporal-mcp-server`) lets you use that name directly as the command.

### Working in this repo

A checked-in `.mcp.json` registers the local build as the `temporal` server, so Claude Code picks up **your** changes rather than the hosted instance:

```json
{
  "mcpServers": {
    "temporal": {
      "command": "node",
      "args": ["dist/node.js"]
    }
  }
}
```

Run `pnpm build` first — it points at `dist/`, so an unbuilt checkout has nothing to launch.

### Verifying it works

The server speaks JSON-RPC on stdout, so you can drive it by hand:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_current_time","arguments":{"timezone":"Asia/Tokyo"}}}' \
  | node dist/node.js
```

Only JSON-RPC goes to stdout; logs go to stderr, so piping is safe.

## Running locally over HTTP

For clients that speak streamable HTTP rather than stdio:

```bash
pnpm start:http     # http://localhost:3333/mcp — override the port with PORT
```

This is the same server and the same tools; only the transport differs.

## Running remotely on Cloudflare Workers

```bash
pnpm cf:dev         # local workerd runtime
pnpm cf:deploy      # build + edge-safety check + deploy
```

`cf:deploy` runs `pnpm build` first, which includes `check:worker` — so a bundle carrying a Node built-in fails before anything reaches Cloudflare.

### Continuous deployment

Deploys run through **Cloudflare Workers Builds** rather than GitHub Actions, so no Cloudflare API token is stored in GitHub at all — Cloudflare connects to the repo through its own GitHub App.

Set it up once in the dashboard (Workers & Pages → `temporal-mcp-server` → Settings → Build):

| Field          | Value                                |
| -------------- | ------------------------------------ |
| Deploy command | `pnpm cf:deploy`                     |
| Build command  | _(leave empty — `cf:deploy` builds)_ |
| Root directory | _(repo root)_                        |

Pointing the deploy command at a package script keeps the gating logic in version control; the dashboard holds one stable line. The Worker name in the dashboard must match `name` in `wrangler.jsonc` (`temporal-mcp-server`), or the build fails.

The build image ships pnpm and honours `.nvmrc` (ours pins Node 24). Non-production branches default to `npx wrangler versions upload`, so branch pushes produce preview versions without touching the live deployment.

The MCP endpoint is at `/mcp`. To require a bearer token:

```bash
wrangler secret put MCP_AUTH_TOKEN
```

With `MCP_AUTH_TOKEN` set, unauthenticated calls to `/mcp` get a 401. Leave it unset and the endpoint is public — reasonable for a clock, not for much else.

### Build provenance

`scripts/deploy.mjs` stamps the deploy with `GIT_COMMIT`, `GIT_BRANCH`, and `BUILD_DATE`, so the `info` tool and `/info` report exactly what is running:

```bash
curl -s https://time.somamcp.com/info   # protected; also available via the `info` MCP tool
```

Workers Builds exposes `WORKERS_CI_COMMIT_SHA` and `WORKERS_CI_BRANCH` during the build, but **build variables are not readable at runtime** — they have to be forwarded as Worker vars, which is what the deploy script does. Running `pnpm cf:deploy` locally falls back to `git rev-parse`, and a deploy from a dirty tree is stamped `<sha>-dirty` rather than claiming to be a commit it isn't.

### Connecting a client to the deployed worker

The public instance is served from a custom domain:

```bash
claude mcp add --transport http temporal https://time.somamcp.com/mcp
```

With a token set, pass it as a header:

```bash
claude mcp add --transport http temporal https://time.somamcp.com/mcp \
  --header "Authorization: Bearer $MCP_AUTH_TOKEN"
```

Health check: [`https://time.somamcp.com/health`](https://time.somamcp.com/health).

`pnpm cf:dev` serves the same thing on `http://localhost:8787/mcp`, so you can point a client at a local workerd instance before deploying.

### Why the worker imports `somamcp/edge`

`somamcp`'s root barrel re-exports helpers that import `node:fs`. Importing it from a Worker drags Node built-ins into the bundle. `src/worker.ts` therefore imports `somamcp/edge`, and `pnpm check:worker` fails the build if a `node:` import, a bare Node built-in, or the root `somamcp` specifier reaches the worker bundle.

See [somamcp's edge runtime docs](https://github.com/sapientsai/SomaMCP#edge-runtimes-cloudflare-workers-deno-deploy-bun) for the full story, including a [feature parity table](https://github.com/sapientsai/SomaMCP#feature-parity) covering what does and does not work on edge — stdio, sessions, `reportProgress`, and multi-result resources are all Node-only.

The check walks the actual import graph from `dist/worker.js` rather than matching filenames — the bundler hoists code shared with the Node entry into a chunk with a generated name, and a filename glob would skip exactly the file most likely to carry a leak.

`nodejs_compat` is deliberately **not** enabled in `wrangler.jsonc`. If a Node built-in ever arrives, the build should fail loudly rather than be silently shimmed.

### The `alias` block in wrangler.jsonc

`xsschema` (transitive, via fastmcp) probes for every schema library it supports — valibot, effect, sury — through dynamic import. We only use zod, so those branches never run, but esbuild still has to resolve the specifiers. They are aliased to an empty module instead of installing three unused libraries.

## Architecture

```
src/
  clock.ts    pure time logic — Either<TemporalError, T>, no I/O, no globals
  tools.ts    MCP tool registration; takes a server, creates none
  index.ts    library surface (runtime-agnostic)
  node.ts     entry: somamcp      -> stdio + httpStream
  worker.ts   entry: somamcp/edge -> export default { fetch }
```

`registerTemporalTools(server)` takes the server rather than building one, so both entry points register identical tools. Nothing in `clock.ts`, `tools.ts`, or `index.ts` touches `process`, the filesystem, or any Node built-in.

Failures are values. Every fallible function in `clock.ts` returns `Either<TemporalError, T>`; the tool layer folds a `Left` into an MCP error result. Nothing depends on stack unwinding, which is what lets the same logic run unchanged on both runtimes.

## Development

```bash
pnpm validate       # format + lint + typecheck + test + build
pnpm test           # 34 tests
pnpm check:worker   # verify the worker bundle is edge-safe
```

`test/worker.spec.ts` drives real `Request` objects through the Worker's `fetch` handler over the MCP wire protocol, so integration breakage surfaces in CI rather than after a deploy.

## License

MIT
