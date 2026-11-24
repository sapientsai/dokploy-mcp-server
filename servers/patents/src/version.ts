/**
 * The package version, so MCP serverInfo and SomaMCP's info tool report what was actually
 * installed. It is read with a JSON import, which the bundler inlines at build time.
 */

import packageJson from "../package.json" with { type: "json" }

export type Semver = `${number}.${number}.${number}`

export const VERSION = packageJson.version as Semver
