# RescueTime MCP Server

A Model Context Protocol (MCP) server for RescueTime - access productivity data, focus sessions, highlights, and activity tracking.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

| Category       | Tools                    | Description                                                                                       |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| **Analytics**  | `get_activity_data`      | Query activity data with flexible filters (date range, category, productivity level, device type) |
|                | `get_daily_summary`      | Last 2 weeks of daily productivity summaries with pulse scores                                    |
|                | `get_productivity_score` | Single-day productivity pulse and detailed breakdown                                              |
| **Focus**      | `start_focus_session`    | Start focus mode (blocks distracting apps and sites)                                              |
|                | `end_focus_session`      | End the current focus session                                                                     |
|                | `get_focus_sessions`     | Recent focus session history                                                                      |
| **Highlights** | `get_highlights`         | Get logged highlights/accomplishments (Premium)                                                   |
|                | `post_highlight`         | Log a new highlight                                                                               |
| **Offline**    | `log_offline_time`       | Log offline activities (meetings, breaks, up to 4 hours)                                          |

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

Get the detailed productivity breakdown for a specific date (defaults to today).

### start_focus_session

Start a RescueTime Focus Session that blocks distracting websites and apps.

**Parameters:**

- `duration` — Minutes (must be a multiple of 5, or -1 for until end of day)

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

## Development

```bash
pnpm install
pnpm validate        # format + lint + typecheck + test + build
pnpm inspect         # Build + launch MCP Inspector for interactive testing
pnpm dev             # Development build with watch mode
```

### Architecture

Built with [FastMCP](https://github.com/punkpeye/fastmcp), [functype](https://github.com/jordanburke/functype) (IO, Option, Either, Try), and [Zod](https://zod.dev/).

- **IO effects**: API calls return `IO<never, Error, T>` — lazy, composable, with built-in retry/timeout
- **IO.gen do-notation**: Complex tool handlers use generator-based do-notation for readable effect composition
- **Option singleton**: Client lifecycle managed via `Option<RescueTimeClient>`
- **Sealed errors**: `ApiError | ConfigError | RateLimitError` with `_kind` discriminator

## License

MIT

---

**Sponsored by <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI" width="20" style="vertical-align: middle;"> SapientsAI</a>** — Building agentic AI for businesses
