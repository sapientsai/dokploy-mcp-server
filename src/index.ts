// Public library surface. Runtime-agnostic: importing this pulls in no Node
// built-ins, so it is safe from a Worker as well as from Node.

export type { Duration, Elapsed, TemporalError } from "./clock.js"
export {
  addDuration,
  between,
  formatInZone,
  offsetInZone,
  parseDuration,
  parseInstant,
  validateTimezone,
} from "./clock.js"
export { registerTemporalTools } from "./tools.js"

export const SERVER_NAME = "temporal-mcp-server"
export const SERVER_VERSION = "0.1.0"
export const INSTRUCTIONS =
  "Temporal tools: read the current time in any IANA timezone, convert timestamps between zones, " +
  "add or subtract ISO-8601 durations with calendar-aware month arithmetic, and measure elapsed time."
