#!/usr/bin/env node
/**
 * Stamp the MCP Registry manifest (server.json) version from package.json.
 *
 * package.json is the single source of truth for the version. server.json carries it
 * in two spots — the top-level `version` and each `packages[].version` — which are easy
 * to forget on a release. The publish workflow runs this before `mcp-publisher publish`
 * so the registered version always matches the npm package (and the git tag).
 *
 * Usage: `node scripts/stamp-server-json.mjs` (or `pnpm stamp:server`).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))

const serverPath = join(root, "server.json")
const server = JSON.parse(readFileSync(serverPath, "utf8"))

server.version = version
for (const pkg of server.packages ?? []) {
  pkg.version = version
}

writeFileSync(serverPath, JSON.stringify(server, null, 2) + "\n")
console.log(`✓ stamped server.json → ${version}`)
