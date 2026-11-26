import dotenv from "dotenv"
import type { UserError } from "fastmcp"
import { FastMCP } from "fastmcp"
import type { Either } from "functype/either"
import { z } from "zod"

import { ApiKey } from "./brands"
import { getDakboardClient, initializeDakboardClient } from "./client/dakboard-client"
import {
  createMetricDataPoints,
  deleteMetric,
  deleteMetricDataPoints,
  getBlock,
  getDevice,
  getLoop,
  getMetric,
  getScreen,
  listBlocks,
  listDevices,
  listLoops,
  listMetrics,
  listScreens,
  updateBlock,
  updateDevice,
  updateScreen,
  visualizeLayout,
} from "./tools"

dotenv.config()

declare const __VERSION__: string
const VERSION = (typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev") as `${number}.${number}.${number}`

const setupDakboardClient = () => {
  const apiKey = process.env.DAKBOARD_API_KEY
  if (!apiKey) {
    console.error("[Error] DAKBOARD_API_KEY is required")
    console.error("[Error] Set the DAKBOARD_API_KEY environment variable with your DAKboard API key")
    process.exit(1)
  }

  initializeDakboardClient(ApiKey(apiKey))
  console.error("[Setup] DAKboard client initialized")
}

/* eslint-disable functype/prefer-either -- boundary: converts Either to FastMCP's throw-based error signaling */
const unwrapResult = <T>(result: Either<UserError, T>): T =>
  result.fold(
    (e) => {
      throw e
    },
    (v) => v,
  )
/* eslint-enable functype/prefer-either */

const server = new FastMCP({
  name: "dakboard-mcp-server",
  version: VERSION,
  instructions: `A DAKboard MCP server for managing digital dashboard screens, blocks, devices, loops, and metrics.

Available capabilities:
- List, view, and update screens
- List, view, and update blocks within screens
- List and view screen loops
- List, view, and update devices
- List, view, create, and delete metrics and data points`,
})

// Connection test
server.addTool({
  name: "test_dakboard_connection",
  description: "Test the DAKboard MCP Server connection and configuration",
  parameters: z.object({}),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async () => {
    const client = getDakboardClient()
    const hasClient = client.fold(
      () => "No",
      () => "Yes",
    )

    return `DAKboard MCP Server Status:
- Server: Running
- Client Initialized: ${hasClient}
- Version: ${VERSION}

Ready to handle DAKboard API requests!`
  },
})

// Screen tools
server.addTool({
  name: "list_screens",
  description: "List all DAKboard screens",
  parameters: z.object({}),
  execute: async () => unwrapResult(await listScreens()),
})

server.addTool({
  name: "get_screen",
  description: "Get detailed information about a specific DAKboard screen including settings",
  parameters: z.object({
    screen_id: z.string().describe("The DAKboard screen ID"),
  }),
  execute: async (args) => unwrapResult(await getScreen(args)),
})

server.addTool({
  name: "update_screen",
  description: "Update a DAKboard screen's settings (name, orientation, dimensions, refresh rate)",
  parameters: z.object({
    screen_id: z.string().describe("The DAKboard screen ID"),
    name: z.string().optional().describe("New screen name"),
    orientation: z.string().optional().describe("Screen orientation"),
    width: z.number().optional().describe("Screen width in pixels"),
    height: z.number().optional().describe("Screen height in pixels"),
    is_default: z.number().min(0).max(1).optional().describe("Set as default screen (0 or 1)"),
    refresh: z.number().optional().describe("Refresh interval in seconds"),
  }),
  execute: async (args) => unwrapResult(await updateScreen(args)),
})

// Block tools
server.addTool({
  name: "list_blocks",
  description: "List all blocks on a DAKboard screen",
  parameters: z.object({
    screen_id: z.string().describe("The DAKboard screen ID"),
  }),
  execute: async (args) => unwrapResult(await listBlocks(args)),
})

server.addTool({
  name: "get_block",
  description: "Get detailed information about a specific block on a DAKboard screen",
  parameters: z.object({
    screen_id: z.string().describe("The DAKboard screen ID"),
    block_id: z.string().describe("The block ID"),
  }),
  execute: async (args) => unwrapResult(await getBlock(args)),
})

server.addTool({
  name: "update_block",
  description:
    "Update a block on a DAKboard screen (position, size, content, visibility). " +
    "IMPORTANT: DAKboard uses non-linear per-block coordinate scaling. The API coordinate values (x, y, w, h) " +
    "do NOT map 1:1 to screen pixels, and updating a block changes its scaling factor permanently. " +
    "Use rendered pixel values at 1920x1080 design resolution as coordinate values. " +
    "Use visualize_screen_layout with screen_uuid first to see the actual layout before making changes.",
  parameters: z.object({
    screen_id: z.string().describe("The DAKboard screen ID"),
    block_id: z.string().describe("The block ID"),
    name: z.string().optional().describe("Block name"),
    w: z.number().optional().describe("Width in pixels at 1920x1080 design resolution"),
    h: z.number().optional().describe("Height in pixels at 1920x1080 design resolution"),
    x: z.number().optional().describe("X position in pixels at 1920x1080 design resolution"),
    y: z.number().optional().describe("Y position in pixels at 1920x1080 design resolution"),
    is_disabled: z.number().min(0).max(1).optional().describe("Disable block (0 or 1)"),
    z_index: z.number().optional().describe("Z-index for layering"),
    text: z.string().optional().describe("Text content"),
    url: z.string().optional().describe("URL content"),
  }),
  execute: async (args) => unwrapResult(await updateBlock(args)),
})

server.addTool({
  name: "visualize_screen_layout",
  description:
    "Visualize the spatial layout of blocks on a DAKboard screen as an ASCII diagram. Provide screen_uuid for accurate CSS-based rendering (from the public screen URL), otherwise falls back to API coordinates.",
  parameters: z.object({
    screen_id: z.string().describe("The DAKboard screen ID"),
    screen_uuid: z
      .string()
      .optional()
      .describe("The screen UUID from the public URL (e.g. '65ac6663-13508f-ea84-b4dd5a6c6616') for accurate layout"),
  }),
  execute: async (args) => unwrapResult(await visualizeLayout(args)),
})

// Loop tools
server.addTool({
  name: "list_loops",
  description: "List all DAKboard screen loops",
  parameters: z.object({}),
  execute: async () => unwrapResult(await listLoops()),
})

server.addTool({
  name: "get_loop",
  description: "Get detailed information about a DAKboard screen loop including its screen rotation",
  parameters: z.object({
    loop_id: z.string().describe("The loop ID"),
  }),
  execute: async (args) => unwrapResult(await getLoop(args)),
})

// Device tools
server.addTool({
  name: "list_devices",
  description: "List all DAKboard devices",
  parameters: z.object({}),
  execute: async () => unwrapResult(await listDevices()),
})

server.addTool({
  name: "get_device",
  description: "Get detailed information about a specific DAKboard device",
  parameters: z.object({
    device_id: z.string().describe("The device ID"),
  }),
  execute: async (args) => unwrapResult(await getDevice(args)),
})

server.addTool({
  name: "update_device",
  description: "Update a DAKboard device's settings (name, IP address, assigned screen)",
  parameters: z.object({
    device_id: z.string().describe("The device ID"),
    name: z.string().optional().describe("Device name"),
    ip_addr: z.string().optional().describe("Device IP address"),
    screen_id: z.string().optional().describe("Assign device to a screen ID"),
  }),
  execute: async (args) => unwrapResult(await updateDevice(args)),
})

// Metric tools
server.addTool({
  name: "list_metrics",
  description: "List all DAKboard custom metrics",
  parameters: z.object({}),
  execute: async () => unwrapResult(await listMetrics()),
})

server.addTool({
  name: "get_metric",
  description: "Get a DAKboard metric with its data points",
  parameters: z.object({
    metric_name: z.string().describe("The metric name"),
  }),
  execute: async (args) => unwrapResult(await getMetric(args)),
})

server.addTool({
  name: "create_metric_data_points",
  description: "Create data points for a DAKboard metric. Send an array of values with optional timestamps.",
  parameters: z.object({
    metric_name: z.string().describe("The metric name"),
    data_points: z
      .array(
        z.object({
          value: z.union([z.string(), z.number()]).describe("Data point value"),
          timestamp: z.string().optional().describe("ISO timestamp (defaults to now)"),
          expires: z.string().optional().describe("ISO timestamp when this data point expires"),
        }),
      )
      .describe("Array of data points to create"),
  }),
  execute: async (args) => unwrapResult(await createMetricDataPoints(args)),
})

server.addTool({
  name: "delete_metric",
  description: "Delete a DAKboard metric and all its data points. WARNING: This cannot be undone.",
  parameters: z.object({
    metric_name: z.string().describe("The metric name to delete"),
  }),
  execute: async (args) => unwrapResult(await deleteMetric(args)),
})

server.addTool({
  name: "delete_metric_data_points",
  description: "Delete data points from a DAKboard metric at a specific timestamp",
  parameters: z.object({
    metric_name: z.string().describe("The metric name"),
    timestamp: z.string().describe("ISO timestamp of data points to delete"),
  }),
  execute: async (args) => unwrapResult(await deleteMetricDataPoints(args)),
})

// Initialize and start
async function main() {
  // eslint-disable-next-line functype/prefer-either -- top-level server startup boundary
  try {
    setupDakboardClient()

    const useHttp = process.env.TRANSPORT_TYPE === "httpStream" || process.env.TRANSPORT_TYPE === "http"
    const port = parseInt(process.env.PORT ?? "3000")
    const host = process.env.HOST ?? "127.0.0.1"

    if (useHttp) {
      console.error(`[Setup] Starting HTTP server on ${host}:${port}`)
      await server.start({
        transportType: "httpStream",
        httpStream: { port, host, endpoint: "/mcp" },
      })
      console.error(`[Setup] HTTP server ready at http://${host}:${port}/mcp`)
    } else {
      console.error("[Setup] Starting in stdio mode")
      await server.start({ transportType: "stdio" })
    }
  } catch (error) {
    console.error("[Error] Failed to start server:", error)
    process.exit(1)
  }
}

process.on("SIGINT", () => {
  console.error("[Shutdown] Shutting down DAKboard MCP Server...")
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.error("[Shutdown] Shutting down DAKboard MCP Server...")
  process.exit(0)
})

main().catch(console.error)
