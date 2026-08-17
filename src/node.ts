#!/usr/bin/env node
// Node entry point: stdio for desktop MCP clients, httpStream for everything else.

import { createServer } from "somamcp"

import { INSTRUCTIONS, registerTemporalTools, SERVER_NAME, SERVER_VERSION } from "./index.js"

const server = createServer({
  instructions: INSTRUCTIONS,
  name: SERVER_NAME,
  version: SERVER_VERSION,
})

registerTemporalTools(server)

// stdio is the default: it is what Claude Desktop and most local clients speak,
// and it keeps the server silent on stdout for anything but JSON-RPC.
const useHttp = process.argv.includes("--http")
const port = Number(process.env.PORT ?? 3333)

if (useHttp) {
  await server.start({ httpStream: { endpoint: "/mcp", port }, transportType: "httpStream" })
  // stderr, not stdout — stdout belongs to the JSON-RPC stream.
  console.error(`${SERVER_NAME} listening on http://localhost:${port}/mcp`)
} else {
  await server.start({ transportType: "stdio" })
}

const shutdown = async (): Promise<void> => {
  await server.stop()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
