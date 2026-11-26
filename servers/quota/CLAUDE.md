# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

quota-mcp-server — a shared API-quota broker for fleets of AI agents, as a Cloudflare Worker with a SQLite-backed Durable Object per `service:account` ledger. Built with SomaMCP (WinterTC entry only), functype and Zod. The spec is `docs/MCP_SPEC_quota-mcp-server_2026-11-26.md`.

This server lives in `servers/quota` of the `sapientsai/mcp-servers` monorepo; the root CLAUDE.md has the repo-wide rules. Release from the root: `pnpm release quota <patch|minor|major>`.

## Commands

```bash
pnpm validate        # format + lint + typecheck + test + build
pnpm run ci          # validate's checks without fixing, as CI runs them
pnpm test            # unit tests, plus test/worker.spec.ts in workerd through Miniflare
pnpm build           # also checks the Worker bundle holds no Node built-ins
pnpm cf:dev          # local workerd via wrangler
```

## Architecture

```
src/
  worker.ts              createQuotaWorker(config), the bearer-key check, /v1/* vs /mcp; exports QuotaLedger
  http.ts                the hook's JSON API: /v1/check, /v1/finish, /v1/report, /v1/status
  tools.ts               the MCP tools
  config.ts              Zod schemas for services and policies; durationMs
  defaults.ts            GitHub and its default policies
  ledgers.ts             sends messages to ledger Durable Objects, as IO
  instructions.ts        the MCP server's instructions
  format.ts              tool output
  parsers/github.ts      GET /rate_limit bodies and x-ratelimit-* headers
  ledger/
    durable-object.ts    QuotaLedger: one ledger, and the broker's own probe
    decide.ts            the decision engine: estimate, policies, the strictest answer
    store.ts             SQLite tables and queries, over a minimal `Sql` interface
    usage.ts             how close each policy is, for quota_policies
    types.ts             shared types; JSON-crossing shapes are Wire<…>
```

## Things that are easy to get wrong

- **workerd treats every named export of `worker.ts` as an entrypoint.** Export only handlers, classes and the factory from it; a string constant there stops the runtime from starting. `test/worker.spec.ts` catches this.
- **No tool may change a policy.** Policies come from the deploy config, so a refused agent can't loosen its own limit. Keep it that way.
- **Never record a command's arguments.** The hook sends a `label` of the command's first words; arguments can hold secrets.
- **The broker holds no service token** except the optional probe token named by `probe.http.tokenSecret`, read from the Worker's env. It must reach only a free, read-only endpoint.
- **Window edges:** a rate window is `(now − per, now]`. The estimate counts spends from the reading's own millisecond on, since a call checked then can't have reached the service yet.
- **A booked hold is a spend in the future.** It counts against every window that includes its time, which is what queues held calls in order.
- **Messages to a Durable Object are JSON.** `Option` doesn't survive that, so `CheckResult`, `LedgerMessage` and `StatusAnswer` are `Wire<…>` shapes with nulls; convert at the edge with `.orNull()`.
- **Tests:** `test/helpers/sqlite.ts` runs the store's real SQL on `node:sqlite`. Miniflare's newest compatibility date can lag `wrangler.jsonc`'s; the test pins its own.
