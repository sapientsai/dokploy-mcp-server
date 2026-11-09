import dotenv from "dotenv"
import { createServer } from "somamcp/node"

import { initializeClient } from "./client/rescuetime-client"
import {
  registerAnalyticsTools,
  registerFocusTools,
  registerHighlightTools,
  registerOfflineTools,
  registerTimesheetTools,
} from "./tools"

dotenv.config({ quiet: true })

declare const __VERSION__: string
const VERSION = (typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev") as `${number}.${number}.${number}`

// Initialize client
const apiKey = process.env.RESCUETIME_API_KEY

if (apiKey === undefined || apiKey === "") {
  console.error("[Error] RESCUETIME_API_KEY environment variable is required.")
  console.error("[Error] Get your API key at: https://www.rescuetime.com/anapi/manage")
  process.exit(1)
}

initializeClient({ apiKey })
console.error(`[Setup] RescueTime MCP Server v${VERSION}`)
console.error("[Setup] Client initialized with API key")

// Create server
const server = createServer({
  name: "rescuetime-mcp-server",
  version: VERSION,
  instructions: `RescueTime MCP Server — provides access to RescueTime productivity data.

## Tool Selection Guide
- **"How productive was I?"** → get_productivity_score (single day) or get_daily_summary (last 2 weeks)
- **"What did I work on?"** → get_activity_data with restrict_kind="activity" or "category"
- **"How much time on X?"** → get_activity_data with restrict_thing="X"
- **"Time breakdown by productivity"** → get_activity_data with restrict_kind="productivity"
- **"What was I just doing?"** → get_recent_activity (latest 5-minute windows of today's timeline)
- **"Help me focus"** → start_focus_session (blocks distracting apps)
- **"Am I in a focus session?" / "Is a timer running?"** → get_focus_state
- **"Start a timer for project X"** → start_timer (Timesheets; never blocks apps)
- **"Stop the timer"** → stop_timer (stops any timer, focus session or zone)
- **"How much time on project X?"** → get_project_time (Timesheets totals, up to 31 days)
- **"Log what I did"** → post_highlight (accomplishment) or log_offline_time (meeting/break)

## Important Constraints
- All dates use YYYY-MM-DD format. All times use ISO 8601 with timezone.
- get_daily_summary returns the last 2 weeks only — no date params.
- get_productivity_score filters from get_daily_summary, so only the last 2 weeks are available.
- Focus session duration must be a multiple of 5 minutes, or -1 for end of day.
- start_timer refuses while anything is running; call stop_timer first.
- Project time entries marked draft are RescueTime's own suggestions that nobody has reviewed.
- Offline time requires both start_time and end_time (no duration param). Max 4 hours. Past only.
- Rate limits: 60 requests/minute, 1,000 requests/hour.`,
})

// Register all tools
registerAnalyticsTools(server)
registerFocusTools(server)
registerHighlightTools(server)
registerOfflineTools(server)
registerTimesheetTools(server)

// Start server
const transportType = (process.env.TRANSPORT_TYPE ?? "stdio") as "stdio" | "httpStream"
const port = Number(process.env.PORT ?? 3000)

void server.start(transportType === "httpStream" ? { transportType, httpStream: { port } } : { transportType: "stdio" })

console.error(`[Setup] Server started with ${transportType} transport`)
