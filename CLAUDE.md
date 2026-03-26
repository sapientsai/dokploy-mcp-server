# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RescueTime MCP Server — a Model Context Protocol server providing AI assistants access to RescueTime productivity data. Built with FastMCP, functype (IO, Option, Either, Try), and Zod.

**Key patterns**: functype `IO<never, Error, T>` for lazy composable API effects with `IO.gen` do-notation, `Option<T>` for singleton client, `Try` for safe formatting, `.runOrThrow()` at tool boundaries.

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
  index.ts                        # FastMCP server setup, tool registration
  bin.ts                          # CLI entry point (stdio transport)
  types.ts                        # All domain types (readonly, immutable)
  errors.ts                       # Sealed error union types (_kind discriminator)
  client/
    rescuetime-client.ts          # Singleton client, IO-based API methods
  tools/
    index.ts                      # Barrel export
    analytics-tools.ts            # get_activity_data, get_daily_summary, get_productivity_score
    focus-tools.ts                # start_focus_session, end_focus_session, get_focus_sessions
    highlight-tools.ts            # get_highlights, post_highlight
    offline-tools.ts              # log_offline_time
  utils/
    formatters.ts                 # Markdown output formatters
```

### Key Patterns

- **Client singleton**: `Option<RescueTimeClient>` with `initializeClient()` / `getClient()`
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

## MCP Tools (9 total)

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `get_activity_data`      | Query activity data with filters (date, category, productivity) |
| `get_daily_summary`      | Last 2 weeks of daily productivity summaries                    |
| `get_productivity_score` | Single-day productivity pulse and breakdown                     |
| `start_focus_session`    | Start focus mode (blocks distracting apps)                      |
| `end_focus_session`      | End current focus session                                       |
| `get_focus_sessions`     | Recent focus session history                                    |
| `get_highlights`         | Get logged highlights/accomplishments                           |
| `post_highlight`         | Log a new highlight                                             |
| `log_offline_time`       | Log offline activities (meetings, breaks)                       |

## RescueTime API Notes

- **Auth**: API key via query param + form-encoded POST body
- **Rate limits**: 60 req/min, 1000 req/hr
- **Data sync**: Premium 3min, Lite 30min
- **Focus sessions**: Duration must be multiple of 5 or -1 (end of day)
- **Highlights/Alerts**: Premium features
