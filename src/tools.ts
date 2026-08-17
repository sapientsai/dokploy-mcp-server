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
    execute: async ({ isoTimestamp, sourceTimezone, targetTimezone }) =>
      validateTimezone(sourceTimezone ?? UTC)
        .flatMap((source) => parseInstant(isoTimestamp, source).map((date) => ({ date, source })))
        .flatMap(({ date, source }) => validateTimezone(targetTimezone).map((tz) => ({ date, source, tz })))
        .fold(err, ({ date, source, tz }) =>
          ok({
            input: isoTimestamp,
            iso: date.toISOString(),
            offset: offsetInZone(date, tz),
            rendered: formatInZone(date, tz),
            sourceTimezone: source,
            targetTimezone: tz,
          }),
        ),
    name: "convert_timezone",
    parameters: z.object({
      isoTimestamp: z.string().describe("ISO-8601 timestamp to convert, e.g. '2026-08-17T14:30:00Z'."),
      sourceTimezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone used to interpret `isoTimestamp` when it carries no 'Z' or offset. Ignored otherwise. Defaults to UTC.",
        ),
      targetTimezone: z.string().describe("IANA timezone identifier to render in."),
    }),
  })

  server.addTool({
    description:
      "Add an ISO-8601 duration to a timestamp, in a timezone. Date units (Y/M/D) are calendar-aware: P1D across a DST boundary keeps the same wall-clock time the next day, and P1M on Jan 31 clamps to the end of February. Time units (H/M/S) are exact elapsed time, so PT24H really is 24 hours. Prefix the duration with '-' to subtract.",
    execute: async ({ duration, isoTimestamp, timezone }) => {
      const zone = timezone ?? UTC
      return validateTimezone(zone)
        .flatMap((tz) => parseInstant(isoTimestamp, tz).map((date) => ({ date, tz })))
        .flatMap(({ date, tz }) => parseDuration(duration).map((parsed) => ({ date, parsed, tz })))
        .fold(err, ({ date, parsed, tz }) => {
          const result = addDuration(date, parsed, tz)
          return ok({
            duration,
            from: date.toISOString(),
            fromLocal: formatInZone(date, tz),
            local: formatInZone(result, tz),
            offset: offsetInZone(result, tz),
            result: result.toISOString(),
            timezone: tz,
          })
        })
    },
    name: "add_duration",
    parameters: z.object({
      duration: z.string().describe("ISO-8601 duration, e.g. 'P1D', 'PT30M', 'P1Y2M3DT4H5M6S', or '-P1W'."),
      isoTimestamp: z.string().describe("ISO-8601 timestamp to shift."),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone governing the arithmetic — calendar units are applied to this zone's wall clock, and a timestamp with no 'Z' or offset is read as wall-clock time here. Defaults to UTC.",
        ),
    }),
  })

  server.addTool({
    description:
      "Exact elapsed time between two ISO-8601 timestamps, broken into days/hours/minutes/seconds plus a human-readable summary. All components share one sign, so they sum correctly; `direction` is 'past', 'future', or 'same'.",
    execute: async ({ from, timezone, to }) => {
      const zone = timezone ?? UTC
      return validateTimezone(zone)
        .flatMap((tz) => parseInstant(from, tz).map((start) => ({ start, tz })))
        .flatMap(({ start, tz }) => parseInstant(to, tz).map((end) => ({ end, start, tz })))
        .fold(err, ({ end, start }) => ok({ from: start.toISOString(), to: end.toISOString(), ...between(start, end) }))
    },
    name: "time_between",
    parameters: z.object({
      from: z.string().describe("Start of the interval, as an ISO-8601 timestamp."),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone used to interpret timestamps that carry no 'Z' or offset. Defaults to UTC."),
      to: z.string().describe("End of the interval, as an ISO-8601 timestamp."),
    }),
  })
}
