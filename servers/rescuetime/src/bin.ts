#!/usr/bin/env node

declare const __VERSION__: string

// Force stdio mode for CLI/npx usage (unless explicitly overridden)
process.env.TRANSPORT_TYPE ??= "stdio"

// Handle command line arguments BEFORE any other imports
const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(__VERSION__)
  process.exit(0)
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
RescueTime MCP Server v${__VERSION__}

Usage: rescuetime-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help

Environment Variables:
  RESCUETIME_API_KEY    RescueTime API key (required)
                        Get yours at: https://www.rescuetime.com/anapi/manage
  TRANSPORT_TYPE        Transport mode: stdio (default) or httpStream
  PORT                  HTTP port when using httpStream (default: 3000)

For more information, visit: https://github.com/sapientsai/rescuetime-mcp-server
`)
  process.exit(0)
}

async function main() {
  await import("./index.js")
}

void main().catch(console.error)
