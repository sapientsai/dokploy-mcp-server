import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { TemporalError } from "./clock.js"
import {
  addDuration,
  between,
  formatInZone,
  offsetInZone,
  parseDuration,
  parseInstant,
  validateTimezone,
} from "./clock.js"

// ── Result Helpers ────────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ text: string; type: "text" }>
  isError?: boolean
}

const ok = (payload: unknown): ToolResult => ({
  content: [{ text: JSON.stringify(payload, null, 2), type: "text" }],
})

/**
 * Renders a TemporalError as a tool error. The hint is included deliberately:
 * an agent that gets "Unknown timezone" alone will guess again, while one that
 * is told the expected format usually corrects on the next call.
 */
const err = (error: TemporalError): ToolResult => ({
  content: [{ text: `${error.message}\n\n${error.hint}`, type: "text" }],
  isError: true,
})

const UTC = "UTC"

const timezoneField = z
  .string()
  .optional()
  .describe("IANA timezone identifier, e.g. 'America/New_York'. Defaults to UTC.")

// ── Registration ──────────────────────────────────────────────────────

/**
 * Registers every temporal tool on a somamcp server.
 *
 * Runtime-agnostic on purpose: it takes the server instance rather than
 * creating one, so the Node entry point and the Cloudflare Worker entry point
 * register byte-identical tools. Nothing here touches `process`, the
 * filesystem, or any Node built-in.
 */
export const registerTemporalTools = (server: SomaServerInstance): void => {
  server.addTool({
    description:
      "Return the current time as an epoch, a UTC ISO-8601 timestamp, and the wall-clock time in a given timezone.",
    execute: async ({ timezone }) => {
      const zone = timezone ?? UTC
      return validateTimezone(zone).fold(err, (tz) => {
        const now = new Date()
        return ok({
          epochMs: now.getTime(),
          iso: now.toISOString(),
          local: formatInZone(now, tz),
          offset: offsetInZone(now, tz),
          timezone: tz,
        })
      })
    },
    name: "get_current_time",
    parameters: z.object({ timezone: timezoneField }),
  })

  server.addTool({
    description: "Render an ISO-8601 timestamp as wall-clock time in a target timezone.",
    execute: async ({ isoTimestamp, targetTimezone }) =>
      parseInstant(isoTimestamp)
        .flatMap((date) => validateTimezone(targetTimezone).map((tz) => ({ date, tz })))
        .fold(err, ({ date, tz }) =>
          ok({
            input: isoTimestamp,
            iso: date.toISOString(),
            offset: offsetInZone(date, tz),
            rendered: formatInZone(date, tz),
            targetTimezone: tz,
          }),
        ),
    name: "convert_timezone",
    parameters: z.object({
      isoTimestamp: z.string().describe("ISO-8601 timestamp to convert, e.g. '2026-08-17T14:30:00Z'."),
      targetTimezone: z.string().describe("IANA timezone identifier to render in."),
    }),
  })

  server.addTool({
    description:
      "Add an ISO-8601 duration to a timestamp. Calendar-aware: adding P1M to Jan 31 clamps to the end of February. Prefix the duration with '-' to subtract.",
    execute: async ({ duration, isoTimestamp, timezone }) => {
      const zone = timezone ?? UTC
      return parseInstant(isoTimestamp)
        .flatMap((date) => parseDuration(duration).map((parsed) => ({ date, parsed })))
        .flatMap(({ date, parsed }) => validateTimezone(zone).map((tz) => ({ date, parsed, tz })))
        .fold(err, ({ date, parsed, tz }) => {
          const result = addDuration(date, parsed)
          return ok({
            duration,
            from: date.toISOString(),
            local: formatInZone(result, tz),
            result: result.toISOString(),
            timezone: tz,
          })
        })
    },
    name: "add_duration",
    parameters: z.object({
      duration: z.string().describe("ISO-8601 duration, e.g. 'P1D', 'PT30M', 'P1Y2M3DT4H5M6S', or '-P1W'."),
      isoTimestamp: z.string().describe("ISO-8601 timestamp to shift."),
      timezone: timezoneField,
    }),
  })

  server.addTool({
    description:
      "Elapsed time between two ISO-8601 timestamps, broken into days/hours/minutes/seconds plus a human-readable summary. Negative when `to` precedes `from`.",
    execute: async ({ from, to }) =>
      parseInstant(from)
        .flatMap((start) => parseInstant(to).map((end) => ({ end, start })))
        .fold(err, ({ end, start }) =>
          ok({ from: start.toISOString(), to: end.toISOString(), ...between(start, end) }),
        ),
    name: "time_between",
    parameters: z.object({
      from: z.string().describe("Start of the interval, as an ISO-8601 timestamp."),
      to: z.string().describe("End of the interval, as an ISO-8601 timestamp."),
    }),
  })
}
