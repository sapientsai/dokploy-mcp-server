# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beszel MCP Server — a read-only Model Context Protocol server for a [Beszel](https://beszel.dev) monitoring hub. Built with SomaMCP, functype (IO, Option, Either, Ref) and Zod. The spec is `docs/MCP_SPEC_beszel-mcp-server_2026-11-25.md`.

This server lives in `servers/beszel` of the `sapientsai/mcp-servers` monorepo; the root CLAUDE.md has the repo-wide rules. Install from the repo root. Release from the root too: `pnpm release beszel <patch|minor|major>` tags `beszel-mcp-server@<version>`, and `git push --follow-tags` publishes this package alone. The `version` script keeps `server.json` in step.

## Commands

```bash
pnpm validate        # format + lint + typecheck + test + build
pnpm run ci          # validate's checks without fixing, as CI runs them
pnpm test            # tests once
pnpm inspect         # build, then open the MCP Inspector
pnpm smoke:live      # every tool against a real hub, from BESZEL_* in the environment; never in CI
```

## Architecture

```
src/
  index.ts                 createServer from somamcp/node, instructions, start
  bin.ts                   CLI entry: --version, --help, stdio by default
  config.ts                reads BESZEL_URL and one sign-in from the environment
  errors.ts                UserError helpers for each failure
  types.ts                 readonly record shapes, Beszel 0.21.x
  client/
    beszel-client.ts       sign-in, the token Ref, records requests as IO
    filter.ts              PocketBase filter quoting and date layout
  tools/                   one file per area; shared.ts resolves a system by name or id
  utils/                   units and tables, ranges, summaries
```

## Things that are easy to get wrong

- **Never interpolate a value into a filter.** Go through `quote` or `equals` in `client/filter.ts`.
- **Dates in filters use PocketBase's layout**, `2006-01-02 15:04:05.000Z`, via `pocketbaseDate`. PocketBase compares dates as text, so an ISO string with a `T` gives the wrong window.
- **Sign in as rarely as possible.** Beszel limits sign-ins to 10 a minute. The client reuses its token until a minute before `exp`, shares one sign-in between concurrent calls, and signs in again only after a 401.
- **A 401 means the token is bad.** PocketBase 0.42 rejects unknown or expired tokens outright rather than treating them as a guest.
- **Units:** `b`, `bb`, `dio` and a container's `net` are bytes per second. Container memory is MB. Disk `d` and `du` are GB. `mem` and `swap` are byte arrays; older agents send `m` and `mu` in GB instead. Sizes print 1024-based, as Beszel does.
- **No real hub in the repo.** Tests, docs and examples use `beszel.example.com` and made-up systems.
- **Beszel's API may change in a minor release.** When the hub moves past 0.21, read its `internal/migrations` and `internal/hub/collections.go` for new fields and access rules.
