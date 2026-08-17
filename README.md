# temporal-mcp-server

[![npm version](https://img.shields.io/npm/v/temporal-mcp-server.svg)](https://www.npmjs.com/package/temporal-mcp-server)

MCP server for time, timezone, and duration tools. One codebase, two deployments: **stdio/HTTP on Node** and **Cloudflare Workers**.

Built on [somamcp](https://github.com/sapientsai/SomaMCP), which supplies the MCP plumbing, telemetry, and health/introspection endpoints for both runtimes. Time logic is pure and functional, using [functype](https://github.com/jordanburke/functype).

## Tools

| Tool               | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `get_current_time` | Current time as epoch, UTC ISO-8601, and wall-clock in any IANA timezone    |
| `convert_timezone` | Render an ISO-8601 timestamp in a target timezone                           |
| `add_duration`     | Add or subtract an ISO-8601 duration, with calendar-aware month arithmetic  |
| `time_between`     | Elapsed time between two timestamps, in whole units plus a readable summary |

`somamcp` also registers an `info` tool and `/health`, `/health/detail`, `/info`, and `/dashboard` endpoints.

### Behaviour worth knowing

**Month arithmetic clamps rather than overflows.** `add_duration` on `2026-01-31` with `P1M` returns `2026-02-28`, not `2026-03-03`. Adding "a month" to the end of a long month lands on the end of the short one.

**Offsets are resolved per instant, not per zone.** `America/New_York` reports `-04:00` in August and `-05:00` in January. DST comes from the runtime's tz database, so there is no offset table here to go stale.

**Errors carry a hint.** An unknown timezone returns the bad value _and_ the expected format, so a calling agent can correct itself instead of guessing again.

## Running locally

```bash
pnpm install
pnpm build

pnpm start          # stdio — for Claude Desktop and most local MCP clients
pnpm start:http     # HTTP on :3333/mcp (override with PORT)
```

### Claude Desktop / Claude Code

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

## Deploying to Cloudflare Workers

```bash
pnpm cf:dev         # local workerd runtime
pnpm cf:deploy      # deploy
```

The MCP endpoint is at `/mcp`. To require a bearer token:

```bash
wrangler secret put MCP_AUTH_TOKEN
```

With `MCP_AUTH_TOKEN` set, unauthenticated calls to `/mcp` get a 401. Leave it unset and the endpoint is public — reasonable for a clock, not for much else.

Optional `vars`: `GIT_COMMIT` and `ENVIRONMENT` are surfaced by the `info` tool and `/info`.

### Why the worker imports `somamcp/edge`

`somamcp`'s root barrel re-exports helpers that import `node:fs`. Importing it from a Worker drags Node built-ins into the bundle. `src/worker.ts` therefore imports `somamcp/edge`, and `pnpm check:worker` fails the build if a `node:` import, a bare Node built-in, or the root `somamcp` specifier reaches the worker bundle.

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
