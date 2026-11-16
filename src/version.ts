/**
 * The package version, so the CLI, MCP serverInfo and SomaMCP's info tool report what was
 * actually installed. It is read with a JSON import, which the bundler inlines as a string at
 * build time, so this module needs no Node API and the Workers-safe `./tools` entry exports it.
 */

import packageJson from "../package.json" with { type: "json" }

export type Semver = `${number}.${number}.${number}`

export const VERSION = packageJson.version as Semver
