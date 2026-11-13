# RescueTime MCP Server

A Model Context Protocol (MCP) server for RescueTime - access productivity data, focus sessions, Timesheets timers and project time, highlights, and activity tracking.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

| Category       | Tools                    | Description                                                                                       |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| **Analytics**  | `get_activity_data`      | Query activity data with flexible filters (date range, category, productivity level, device type) |
|                | `get_daily_summary`      | Last 2 weeks of daily productivity summaries with pulse scores                                    |
|                | `get_productivity_score` | Single-day productivity pulse and detailed breakdown                                              |
|                | `get_recent_activity`    | Latest 5-minute windows of a day's timeline, newest first                                         |
| **Focus**      | `start_focus_session`    | Start focus mode (blocks distracting apps and sites)                                              |
|                | `end_focus_session`      | End a focus session started with `start_focus_session`                                            |
|                | `get_focus_sessions`     | Recent focus session history                                                                      |
|                | `get_focus_state`        | What is running now: a focus session, focus zone, or timer                                        |
| **Timesheets** | `start_timer`            | Start a timer, optionally for a project and task (never blocks apps)                              |
|                | `stop_timer`             | Stop whatever timer, focus session or zone is running                                             |
|                | `get_project_time`       | Project time totals and entries, up to 31 days                                                    |
| **Highlights** | `get_highlights`         | Get logged highlights/accomplishments (Premium)                                                   |
|                | `post_highlight`         | Log a new highlight                                                                               |
| **Offline**    | `log_offline_time`       | Log offline activities (meetings, breaks, up to 4 hours)                                          |
| **Server**     | `info`                   | Server name, version, build, and capability counts (built into SomaMCP)                           |

## Quick Start

### Option 1: NPX (No install required)

```bash
RESCUETIME_API_KEY=your_key npx rescuetime-mcp-server
```

Or add to your MCP config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "rescuetime": {
      "command": "npx",
      "args": ["rescuetime-mcp-server"],
      "env": {
        "RESCUETIME_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Option 2: Claude Code

```bash
claude mcp add --transport stdio rescuetime -- npx rescuetime-mcp-server
```

Then set your API key in your environment or `.env` file.

### Option 3: Install globally

```bash
npm install -g rescuetime-mcp-server
RESCUETIME_API_KEY=your_key rescuetime-mcp-server
```

## Getting Your API Key

1. Go to [https://www.rescuetime.com/anapi/manage](https://www.rescuetime.com/anapi/manage)
2. Create a new API key
3. Set it as the `RESCUETIME_API_KEY` environment variable

## Environment Variables

| Variable             | Required | Description                                     |
| -------------------- | -------- | ----------------------------------------------- |
| `RESCUETIME_API_KEY` | Yes      | RescueTime API key                              |
| `TRANSPORT_TYPE`     | No       | `stdio` (default) or `httpStream`               |
| `PORT`               | No       | HTTP port when using httpStream (default: 3000) |

## Tool Details

### get_activity_data

Query activity data with flexible filters. Returns time spent on activities, categories, or productivity levels.

**Parameters:**

- `perspective` — `rank` (default), `interval`, or `member`
- `resolution` — `month`, `week`, `day` (default), `hour`, or `minute`
- `restrict_kind` — `activity` (default), `category`, `productivity`, `document`, `efficiency`, or `overview`
- `restrict_begin` / `restrict_end` — Date range (YYYY-MM-DD)
- `restrict_thing` — Filter to specific activity or category name
- `restrict_source_type` — `computers`, `mobile`, or `offline`

### get_daily_summary

Returns the last 2 weeks of daily productivity rollups. Each day includes:

- **Productivity Pulse** (0-100 score)
- Time breakdowns by productivity level (Very Productive through Very Distracting)
- Category percentages (Software Development, Communication, etc.)

### get_productivity_score

Get the detailed productivity breakdown for one completed day. Defaults to the most recent one, usually yesterday: RescueTime's daily summaries never include today.

### start_focus_session

Start a RescueTime Focus Session that blocks distracting websites and apps.

**Parameters:**

- `duration` — Minutes (must be a multiple of 5, or -1 for until end of day)

### get_recent_activity

The latest stretch of a day's timeline. Each row is a 5-minute window and its main activity.

**Parameters:**

- `date` — Day (YYYY-MM-DD). Defaults to today in the RescueTime account's timezone.
- `limit` — Windows with activity to show (default 24; max 288, a full day). Untracked windows are skipped, so 24 can span more than 2 hours.

### start_timer

Start a Timesheets timer. It never blocks apps or sites, and it refuses while a timer, focus session or zone is running. RescueTime ends an unstopped timer after 24 hours.

**Parameters:**

- `project` — Project name (optional). Case-insensitive; a unique partial name also works.
- `task` — Task name within the project (optional, needs `project`)
- `label` — Short description (optional)

### get_project_time

Timesheets project time: totals per project and task, then each entry by day. Entries RescueTime suggested and nobody has reviewed are marked as drafts.

**Parameters:**

- `start_date`, `end_date` — YYYY-MM-DD. Omit both for today. At most 31 days per call.

### post_highlight

Log an accomplishment or milestone. Premium feature.

**Parameters:**

- `description` — Highlight text (max 255 characters)
- `highlight_date` — Date (YYYY-MM-DD, defaults to today)
- `source` — Source label (defaults to "mcp-server")

### log_offline_time

Log time spent away from the computer (meetings, breaks, etc.).

**Parameters:**

- `start_time` — ISO 8601 format with timezone (e.g., `2026-03-26T09:00:00-04:00`)
- `end_time` — ISO 8601 format with timezone. Max 4 hours after start.
- `activity_name` — Short name (e.g., "Team Meeting", "Lunch Break")
- `activity_details` — Additional details (optional)

## RescueTime API Notes

- **Rate limits**: 60 requests/minute, 1,000 requests/hour
- **Data sync**: Premium accounts sync every 3 minutes, Lite every 30 minutes
- **Highlights & Alerts**: Premium features
- **Offline time**: Max 4 hours per entry, no future dates
- **Two APIs, one key**: analytics, highlights, offline time and `start_focus_session` use the [Analytic Data API](https://www.rescuetime.com/apidoc). Focus state, timers, project time and the timeline use the [Resource API](https://www.rescuetime.com/api-docs), with the same key sent as a Bearer token.
- **Times** are printed in the account's time zone from its RescueTime settings. RescueTime itself sends some timestamps with its own server's Pacific offset.
- **Project time** is fetched one day at a time: RescueTime returns HTTP 500 for multi-day windows.

## Development

```bash
pnpm install
pnpm validate        # format + lint + typecheck + test + build
pnpm inspect         # Build + launch MCP Inspector for interactive testing
pnpm dev             # Development build with watch mode
```

### Architecture

Built with [SomaMCP](https://github.com/sapientsai/SomaMCP), [functype](https://github.com/jordanburke/functype) (IO, Option, Either, Try), and [Zod](https://zod.dev/).

- **IO effects**: API calls return `IO<never, Error, T>` — lazy, composable, with built-in retry/timeout
- **IO.gen do-notation**: Complex tool handlers use generator-based do-notation for readable effect composition
- **Ref singleton**: Client lifecycle managed via `Ref<Option<RescueTimeClient>>`
- **Sealed errors**: `ApiError | ConfigError | RateLimitError` with `_kind` discriminator

## License

MIT

---

**Sponsored by <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI" width="20" style="vertical-align: middle;"> SapientsAI</a>** — Building agentic AI for businesses
