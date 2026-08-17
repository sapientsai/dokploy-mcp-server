import type { Either } from "functype"
import { Left, Right } from "functype"

// ── Errors ────────────────────────────────────────────────────────────

/**
 * Failures are values, not exceptions. Every function here returns
 * `Either<TemporalError, T>` so callers decide how to surface a problem —
 * the MCP tool layer turns a Left into an `isError` result, tests assert on it
 * directly, and nothing depends on stack unwinding.
 */
export type TemporalError = {
  hint: string
  message: string
}

const fail = (message: string, hint: string): Either<TemporalError, never> => Left({ hint, message })

// ── Timezones ─────────────────────────────────────────────────────────

/**
 * Validates an IANA timezone by asking Intl to use it. There is no lookup table
 * to drift out of date — the runtime's own tz database is the source of truth.
 */
export const validateTimezone = (timezone: string): Either<TemporalError, string> => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return Right(timezone)
  } catch {
    return fail(
      `Unknown timezone: ${timezone}`,
      "Use an IANA timezone identifier such as 'America/New_York', 'Europe/London', or 'UTC'.",
    )
  }
}

const partsOf = (date: Date, timezone: string): Record<string, string> => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date)

  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** Wall-clock time in a zone, as `YYYY-MM-DDTHH:mm:ss` (no offset suffix). */
export const formatInZone = (date: Date, timezone: string): string => {
  const p = partsOf(date, timezone)
  // Intl renders midnight as hour 24 in some runtimes; normalize to 00.
  const hour = p.hour === "24" ? "00" : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}`
}

/**
 * UTC offset for a zone at a given instant, as `+HH:MM`.
 *
 * Derived by diffing the zone's wall clock against UTC's, so DST is handled by
 * the tz database rather than by us.
 */
export const offsetInZone = (date: Date, timezone: string): string => {
  const asUTC = Date.parse(`${formatInZone(date, "UTC")}Z`)
  const asZone = Date.parse(`${formatInZone(date, timezone)}Z`)
  const minutes = Math.round((asZone - asUTC) / 60_000)
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
}

// ── Instants ──────────────────────────────────────────────────────────

export const parseInstant = (isoTimestamp: string): Either<TemporalError, Date> => {
  const date = new Date(isoTimestamp)
  return Number.isNaN(date.getTime())
    ? fail(
        `Invalid ISO-8601 timestamp: ${isoTimestamp}`,
        "Provide a timestamp such as '2026-08-17T14:30:00Z' or '2026-08-17T10:30:00-04:00'.",
      )
    : Right(date)
}

// ── Durations ─────────────────────────────────────────────────────────

export type Duration = {
  days: number
  hours: number
  minutes: number
  months: number
  seconds: number
  years: number
}

const DURATION_PATTERN =
  /^(?<sign>[+-])?P(?!$)(?:(?<years>\d+(?:\.\d+)?)Y)?(?:(?<months>\d+(?:\.\d+)?)M)?(?:(?<weeks>\d+(?:\.\d+)?)W)?(?:(?<days>\d+(?:\.\d+)?)D)?(?:T(?!$)(?:(?<hours>\d+(?:\.\d+)?)H)?(?:(?<minutes>\d+(?:\.\d+)?)M)?(?:(?<seconds>\d+(?:\.\d+)?)S)?)?$/

/**
 * Parses an ISO-8601 duration (`P1Y2M3DT4H5M6S`), including a leading sign and
 * week designator. Weeks fold into days; the calendar fields stay separate
 * because adding "1 month" is not adding a fixed number of milliseconds.
 */
export const parseDuration = (duration: string): Either<TemporalError, Duration> => {
  const match = DURATION_PATTERN.exec(duration.trim())
  if (!match?.groups) {
    return fail(
      `Invalid ISO-8601 duration: ${duration}`,
      "Use a duration such as 'P1D' (one day), 'PT30M' (thirty minutes), or 'P1Y2M3DT4H5M6S'. Negative durations may be prefixed with '-'.",
    )
  }

  const g = match.groups
  const scale = g.sign === "-" ? -1 : 1
  const num = (value?: string): number => (value === undefined ? 0 : Number(value) * scale)

  return Right({
    days: num(g.days) + num(g.weeks) * 7,
    hours: num(g.hours),
    minutes: num(g.minutes),
    months: num(g.months),
    seconds: num(g.seconds),
    years: num(g.years),
  })
}

/**
 * Adds a duration to an instant.
 *
 * Calendar fields (years, months) are applied via UTC date arithmetic so that
 * "one month after Jan 31" clamps to the end of February rather than silently
 * rolling into March. Time fields are exact milliseconds.
 */
export const addDuration = (date: Date, duration: Duration): Date => {
  const shifted = new Date(date.getTime())

  const targetMonth = shifted.getUTCMonth() + duration.months + duration.years * 12
  const dayOfMonth = shifted.getUTCDate()
  shifted.setUTCDate(1)
  shifted.setUTCMonth(targetMonth)
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
  shifted.setUTCDate(Math.min(dayOfMonth, lastDay))

  const millis =
    duration.days * 86_400_000 + duration.hours * 3_600_000 + duration.minutes * 60_000 + duration.seconds * 1_000

  return new Date(shifted.getTime() + millis)
}

// ── Elapsed time ──────────────────────────────────────────────────────

export type Elapsed = {
  days: number
  hours: number
  humanized: string
  milliseconds: number
  minutes: number
  seconds: number
}

/** Exact elapsed time between two instants, broken into whole units. */
export const between = (from: Date, to: Date): Elapsed => {
  const milliseconds = to.getTime() - from.getTime()
  const abs = Math.abs(milliseconds)

  const days = Math.floor(abs / 86_400_000)
  const hours = Math.floor((abs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((abs % 3_600_000) / 60_000)
  const seconds = Math.floor((abs % 60_000) / 1_000)

  const units = [
    [days, "day"],
    [hours, "hour"],
    [minutes, "minute"],
    [seconds, "second"],
  ] as const

  const spoken = units
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`)
    .join(", ")

  const humanized = spoken === "" ? "0 seconds" : milliseconds < 0 ? `${spoken} ago` : spoken

  return {
    days: milliseconds < 0 ? -days : days,
    hours,
    humanized,
    milliseconds,
    minutes,
    seconds,
  }
}
