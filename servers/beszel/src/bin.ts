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
Beszel MCP Server v${__VERSION__}

Usage: beszel-mcp-server [options]

Options:
  -v, --version        Show version number
  -h, --help           Show help

Environment Variables:
  BESZEL_URL            Your Beszel hub's base URL (required)
  BESZEL_EMAIL          A Beszel user's email, ideally a readonly user
  BESZEL_PASSWORD       That user's password
  BESZEL_TOKEN          A PocketBase auth token, instead of email and password
  TRANSPORT_TYPE        Transport mode: stdio (default) or httpStream
  PORT                  HTTP port when using httpStream (default: 3000)

For more information, visit: https://github.com/sapientsai/mcp-servers/tree/main/servers/beszel
`)
  process.exit(0)
}

async function main() {
  await import("./index.js")
}

void main().catch(console.error)
