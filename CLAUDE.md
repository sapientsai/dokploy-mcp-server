# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RescueTime MCP Server — a Model Context Protocol server providing AI assistants access to RescueTime productivity data. Built with SomaMCP, functype (IO, Option, Either, Try), and Zod.

**Key patterns**: functype `IO<never, Error, T>` for lazy composable API effects with `IO.gen` do-notation, `Ref<Option<T>>` for singleton client, `Try` for safe formatting, `.runOrThrow()` at tool boundaries.

## Development Commands

```bash
pnpm validate        # Main command: format + lint + typecheck + test + build
pnpm test            # Run tests once
pnpm test:watch      # Run tests in watch mode
pnpm build           # Production build (outputs to dist/)
pnpm inspect         # Build + launch MCP Inspector for interactive testing
pnpm start           # Build + run CLI
pnpm serve           # Build + run as Node process
```

### Running a Single Test

```bash
pnpm test -- --testNamePattern="pattern"
pnpm test -- test/specific.spec.ts
```

## Architecture

```
src/
  index.ts                        # SomaMCP server setup (createServer from somamcp/node), tool registration
  bin.ts                          # CLI entry point (stdio transport)
  types.ts                        # All domain types (readonly, immutable)
  errors.ts                       # Sealed error union types (_kind discriminator)
  client/
    rescuetime-client.ts          # Singleton client, IO-based API methods
  tools/
    index.ts                      # Barrel export
    analytics-tools.ts            # get_activity_data, get_daily_summary, get_productivity_score, get_recent_activity
    focus-tools.ts                # start_focus_session, end_focus_session, get_focus_sessions, get_focus_state
    highlight-tools.ts            # get_highlights, post_highlight
    offline-tools.ts              # log_offline_time
    timesheet-tools.ts            # start_timer, stop_timer, get_project_time
  utils/
    formatters.ts                 # Markdown formatters for Analytic Data API responses
    resource-formatters.ts        # Markdown formatters for Resource API responses
    dates.ts                      # localDate (not UTC), dateRange (capped at 31 days)
    projects.ts                   # resolveTimerLink: project/task names → ids
```

### Key Patterns

- **Client singleton**: `Ref<Option<RescueTimeClient>>` with `initializeClient()` / `getClient()`
- **API calls**: Return `IO<never, Error, T>` via `IO.tryPromise()` + `IO.fromEither()` — lazy until `.run()`
- **Tool boundary**: `IO.gen(function* () { ... }).runOrThrow()` — do-notation with no explicit throws
- **Client unwrap**: `getClient().toEither(err)` → `IO.fromEither()` — stays in the IO pipeline
- **Error types**: Sealed union `AppError = ApiError | ConfigError | RateLimitError` with `_kind`
- **Formatting**: Array-join pattern with `.map()` for functional style

### Build System

- **ts-builds + tsdown**: Custom config with dual entry (index + bin), **VERSION** define
- **TypeScript**: `tsconfig.json` extends `ts-builds/tsconfig`
- **ESLint**: `eslint-config-functype` for FP patterns
- **Output**: `dist/index.js` + `dist/bin.js` (ESM)

## Environment Variables

| Variable             | Required | Description                              |
| -------------------- | -------- | ---------------------------------------- |
| `RESCUETIME_API_KEY` | Yes      | API key from rescuetime.com/anapi/manage |
| `TRANSPORT_TYPE`     | No       | `stdio` (default) or `httpStream`        |
| `PORT`               | No       | HTTP port (default: 3000)                |

## MCP Tools (14 RescueTime tools + SomaMCP `info`)

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `info`                   | SomaMCP introspection: name, version, build, capability counts  |
| `get_activity_data`      | Query activity data with filters (date, category, productivity) |
| `get_daily_summary`      | Last 2 weeks of daily productivity summaries                    |
| `get_productivity_score` | Single-day productivity pulse and breakdown                     |
| `get_recent_activity`    | Latest 5-minute timeline windows (Resource API)                 |
| `start_focus_session`    | Start focus mode (blocks distracting apps)                      |
| `end_focus_session`      | End current focus session                                       |
| `get_focus_sessions`     | Recent focus session history                                    |
| `get_focus_state`        | What is running now: session, zone, or timer (Resource API)     |
| `start_timer`            | Timesheets timer, optional project/task, no blocking            |
| `stop_timer`             | Stop any running timer, session or zone (Resource API)          |
| `get_project_time`       | Timesheets project time, per day, up to 31 days                 |
| `get_highlights`         | Get logged highlights/accomplishments                           |
| `post_highlight`         | Log a new highlight                                             |
| `log_offline_time`       | Log offline activities (meetings, breaks)                       |

## RescueTime API Notes

- **Two APIs, one key.** Analytic Data API (`/anapi/*`): key as a query param, form-encoded POSTs. Resource API (`/api/resource/*`): the same key as `Authorization: Bearer`, JSON bodies, no key in the URL. `resourceRequest` in the client handles the second.
- **Resource API shapes** were observed live (2026-11-08), not taken from the docs, which leave them out. Fixtures in `test/fixtures/resource.ts` copy them.
- **`focus/start_session` while something runs** returns 201 with the existing state rather than an error, so `start_timer` checks `user_global_states` first.
- **`focus/cancel_or_stop_session`** answers `deleted` (stopped early, record discarded), `updated` (kept), or `none`.
- **`labeled_time_project_times`** returns HTTP 500 for a multi-day `start_time`/`end_time` window; fetch per `date`. `force=true` doesn't help. Poll with `job_id` only when one comes back.
- **"Today"**: use `localDate()` or omit the date so RescueTime uses the account's day. `new Date().toISOString()` is UTC and runs a day ahead in the evening.
- **Rate limits**: 60 req/min, 1000 req/hr
- **Data sync**: Premium 3min, Lite 30min
- **Focus sessions**: Duration must be multiple of 5 (5-480) or -1 (end of day)
- **Offline time**: Requires both start_time and end_time (ISO 8601). Max 4 hours, past only.
- **Highlights**: Post always succeeds, feed may have sync delay
