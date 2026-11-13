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
    time.ts                       # dateTimeIn/clockIn: print times in the account's time zone
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

- **Two APIs, one key, sent as `Authorization: Bearer`.** Resource API (`/api/resource/*`): JSON bodies, no key in the URL. Analytic Data API (`/anapi/*`): GETs use Bearer too (checked live 2026-11-13). Its form-encoded POSTs still put the key in the URL and the body, because proving Bearer for them would take a real write.
- **A bad key** comes back as HTTP 401 from the Resource API, and as HTTP 400 `{"messages":"key not found"}` from the Analytic Data API. A malformed Analytic query is also a 400, with `"query error"`. `checkResponse` turns both bad-key forms into a `UserError` with category `auth`.
- **Resource API shapes** were observed live (2026-11-08 to 11-13), not taken from the docs, which leave them out. Fixtures in `test/fixtures/resource.ts` copy them.
- **A timer's project** comes back in `state.project` (`{id, name}`) on `user_global_states`. `v2_project_id` and `task_id` are request fields for `focus/start_session` only and never appear in a response.
- **Timestamps carry RescueTime's server offset, not the account's.** Project-time entries and focus records come back as `…-08:00` (Pacific, `-07:00` in summer) even though the account is `America/New_York`. Timeline bucket keys do use the account's zone. Tools print times through `client.accountTimeZone()`, which reads `time_zone` from `GET /api/resource/users` once and caches it. If that lookup fails, times fall back to labeled UTC, or to the clock time as sent with its offset stated. Read only `time_zone` from that record: it also holds email, phone and address.
- **Unverified:** whether `labeled_time_project_times?date=` cuts on the account's day or on Pacific's. An entry between 21:00 and 24:00 Eastern would tell.
- **`focus/start_session` while something runs** returns 201 with the existing state rather than an error, so `start_timer` checks `user_global_states` first.
- **`focus/cancel_or_stop_session`** answers `deleted` (stopped early, record discarded), `updated` (kept), or `none`.
- **`labeled_time_project_times`** returns HTTP 500 for a multi-day `start_time`/`end_time` window; fetch per `date`. `force=true` doesn't help. Poll with `job_id` only when one comes back.
- **"Today"**: use `localDate()` or omit the date so RescueTime uses the account's day. `new Date().toISOString()` is UTC and runs a day ahead in the evening.
- **`daily_summary_feed` never includes today.** A day's summary appears after midnight, so `get_productivity_score` defaults to the newest day in the feed.
- **Rate limits**: 60 req/min, 1000 req/hr
- **Data sync**: Premium 3min, Lite 30min
- **Focus sessions**: Duration must be multiple of 5 (5-480) or -1 (end of day)
- **Offline time**: Requires both start_time and end_time (ISO 8601). Max 4 hours, past only.
- **Highlights**: Post always succeeds, feed may have sync delay
