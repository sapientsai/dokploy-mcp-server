#!/usr/bin/env node

declare const __VERSION__: string

if (!process.env.TRANSPORT_TYPE) {
  process.env.TRANSPORT_TYPE = "stdio"
}

const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(__VERSION__)
  process.exit(0)
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Dokploy MCP Server v${__VERSION__}

Usage: dokploy-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help

Environment Variables:
  DOKPLOY_URL           Dokploy instance URL (required, e.g., https://dokploy.example.com)
  DOKPLOY_API_KEY       API key for authentication (required)
  TRANSPORT_TYPE        Transport mode: stdio (default) or httpStream
  PORT                  HTTP port when using httpStream (default: 3000)
  HOST                  HTTP host when using httpStream (default: 0.0.0.0)

For more information, visit: https://github.com/jordanburke/dokploy-mcp-server
`)
  process.exit(0)
}

async function main() {
  await import("./index.js")
}

main().then()
