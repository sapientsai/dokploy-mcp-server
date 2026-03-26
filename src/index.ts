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

Available capabilities:
- Query activity data by date range, category, productivity level
- Get daily productivity summaries and scores
- Start/end focus sessions to block distracting apps
- Log highlights (accomplishments) and offline time

Rate limits: 60 requests/minute, 1,000 requests/hour.
Data sync: Premium accounts sync every 3 minutes, Lite every 30 minutes.`,
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
