import dotenv from "dotenv"
import { FastMCP } from "fastmcp"

import { initializeClient } from "./client/rescuetime-client"
import { registerAnalyticsTools, registerFocusTools, registerHighlightTools, registerOfflineTools } from "./tools"

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
const server = new FastMCP({
  name: "rescuetime-mcp-server",
  version: VERSION,
  instructions: `RescueTime MCP Server — provides access to RescueTime productivity data.

## Tool Selection Guide
- **"How productive was I?"** → get_productivity_score (single day) or get_daily_summary (last 2 weeks)
- **"What did I work on?"** → get_activity_data with restrict_kind="activity" or "category"
- **"How much time on X?"** → get_activity_data with restrict_thing="X"
- **"Time breakdown by productivity"** → get_activity_data with restrict_kind="productivity"
- **"Help me focus"** → start_focus_session (blocks distracting apps)
- **"Log what I did"** → post_highlight (accomplishment) or log_offline_time (meeting/break)

## Important Constraints
- All dates use YYYY-MM-DD format. All times use ISO 8601 with timezone.
- get_daily_summary returns the last 2 weeks only — no date params.
- get_productivity_score filters from get_daily_summary, so only the last 2 weeks are available.
- Focus session duration must be a multiple of 5 minutes, or -1 for end of day.
- Offline time requires both start_time and end_time (no duration param). Max 4 hours. Past only.
- Rate limits: 60 requests/minute, 1,000 requests/hour.`,
})

// Register all tools
registerAnalyticsTools(server)
registerFocusTools(server)
registerHighlightTools(server)
registerOfflineTools(server)

// Start server
const transportType = (process.env.TRANSPORT_TYPE ?? "stdio") as "stdio" | "httpStream"
const port = Number(process.env.PORT ?? 3000)

void server.start({
  transportType,
  ...(transportType === "httpStream" ? { httpStream: { port } } : {}),
})

console.error(`[Setup] Server started with ${transportType} transport`)
