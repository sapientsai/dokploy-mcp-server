/**
 * The package version, read from package.json so the CLI, MCP serverInfo
 * and SomaMCP's info tool report what was actually installed.
 */

import { readFileSync } from "node:fs"

export type Semver = `${number}.${number}.${number}`

// src/version.ts and dist/version.js both sit one level below package.json
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: Semver
}

export const VERSION: Semver = packageJson.version
