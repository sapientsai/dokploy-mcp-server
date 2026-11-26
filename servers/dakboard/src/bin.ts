#!/usr/bin/env node

declare const __VERSION__: string

process.env.TRANSPORT_TYPE ??= "stdio"

const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(__VERSION__)
  process.exit(0)
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
DAKboard MCP Server v${__VERSION__}

Usage: dakboard-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help

Environment Variables:
  DAKBOARD_API_KEY     DAKboard API key (required)
  TRANSPORT_TYPE       Transport type: stdio (default) or httpStream
  PORT                 HTTP server port (default: 3000)
  HOST                 HTTP server host (default: 127.0.0.1)

For more information, visit: https://github.com/jordanburke/dakboard-mcp-server
`)
  process.exit(0)
}

async function main() {
  await import("./index.js")
}

main().catch(console.error)
