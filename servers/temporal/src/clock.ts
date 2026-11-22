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
 * Offset from UTC in minutes for a zone at a given instant.
 *
 * Derived by diffing the zone's wall clock against UTC's, so DST comes from the
 * tz database rather than from us.
 */
export const offsetMinutesInZone = (date: Date, timezone: string): number => {
  const asUTC = Date.parse(`${formatInZone(date, "UTC")}Z`)
  const asZone = Date.parse(`${formatInZone(date, timezone)}Z`)
  return Math.round((asZone - asUTC) / 60_000)
}

/** UTC offset for a zone at a given instant, as `+HH:MM`. */
export const offsetInZone = (date: Date, timezone: string): string => {
  const minutes = offsetMinutesInZone(date, timezone)
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
}

// ── Civil (wall-clock) time ───────────────────────────────────────────

/** A wall-clock date and time, with no zone or offset attached. */
export type Civil = {
  day: number
  hour: number
  minute: number
  month: number
  second: number
  year: number
}

/** The wall-clock reading a zone shows at a given instant. */
export const civilInZone = (date: Date, timezone: string): Civil => {
  const p = partsOf(date, timezone)
  const hour = p.hour === "24" ? "00" : p.hour
  return {
    day: Number(p.day),
    hour: Number(hour),
    minute: Number(p.minute),
    month: Number(p.month),
    second: Number(p.second),
    year: Number(p.year),
  }
}

/**
 * The instant at which a zone shows the given wall-clock reading.
 *
 * Inverting a zone conversion is not a closed-form calculation: the offset you
 * need depends on the instant you are trying to find. So guess using UTC, look
 * up the real offset at that guess, correct, and re-check. Two passes settle
 * every case the tz database produces.
 *
 * DST edges have no clean answer and we pick deliberately:
 *   - Ambiguous (fall back, the hour repeats) — the first/earlier occurrence.
 *   - Skipped (spring forward, the hour does not exist) — rolls forward into
 *     the hour after the gap, matching Temporal's "compatible" behaviour.
 */
export const civilToInstant = (civil: Civil, timezone: string): Date => {
  const guess = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second)

  const firstOffset = offsetMinutesInZone(new Date(guess), timezone)
  const candidate = new Date(guess - firstOffset * 60_000)

  const secondOffset = offsetMinutesInZone(candidate, timezone)
  if (secondOffset === firstOffset) return candidate

  // The offset changed between the guess and the candidate — we straddled a
  // transition. Re-solve with the corrected offset and keep it only if it is
  // self-consistent; otherwise the reading was skipped, and `candidate` already
  // sits on the far side of the gap.
  const corrected = new Date(guess - secondOffset * 60_000)
  return offsetMinutesInZone(corrected, timezone) === secondOffset ? corrected : candidate
}

// ── Instants ──────────────────────────────────────────────────────────

/**
 * ISO-8601 date-time, with an optional `Z` or `±HH:MM` offset.
 *
 * Parsing is strict on purpose. `new Date(...)` accepts things like
 * "17 Aug 2026" and resolves naive strings against the *host* zone, so the same
 * input answered differently on a laptop than on a Worker. A rejected input with
 * a hint beats a silently host-dependent one.
 */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i

/**
 * Parse an ISO-8601 timestamp.
 *
 * A timestamp carrying `Z` or an offset denotes an exact instant. A naive one
 * (no zone marker) is read as wall-clock time in `timezone` — that is the whole
 * point of the parameter, and it is what makes "midnight on the 1st in New York"
 * expressible.
 */
export const parseInstant = (isoTimestamp: string, timezone = "UTC"): Either<TemporalError, Date> => {
  const match = ISO_INSTANT.exec(isoTimestamp.trim())
  if (!match) {
    return fail(
      `Invalid ISO-8601 timestamp: ${isoTimestamp}`,
      "Provide a timestamp such as '2026-08-17T14:30:00Z' (UTC), '2026-08-17T10:30:00-04:00' (fixed offset), or '2026-08-17T10:30:00' (wall-clock time in the supplied timezone).",
    )
  }

  const [, year, month, day, hour, minute, second, zone] = match
  const civil: Civil = {
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    month: Number(month),
    second: Number(second ?? "0"),
    year: Number(year),
  }

  if (civil.month < 1 || civil.month > 12 || civil.day < 1 || civil.day > 31) {
    return fail(`Invalid ISO-8601 timestamp: ${isoTimestamp}`, "Month must be 01-12 and day must be 01-31.")
  }

  // Zone-qualified: an exact instant, independent of the timezone parameter.
  if (zone !== undefined) {
    const exact = new Date(isoTimestamp.trim())
    return Number.isNaN(exact.getTime())
      ? fail(`Invalid ISO-8601 timestamp: ${isoTimestamp}`, "Check the date is a real calendar date.")
      : Right(exact)
  }

  // Naive: resolve against the supplied zone, never the host's.
  return Right(civilToInstant(civil, timezone))
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
 * Adds a duration to an instant, in a timezone.
 *
 * Date units and time units are not the same kind of thing, and conflating them
 * is the classic DST bug:
 *
 *   - **Years, months, days** are *calendar* units, applied to the wall clock in
 *     `timezone`. Adding P1D across a US "fall back" boundary lands on the same
 *     wall-clock time the next day — 25 real hours later, which is what a person
 *     means by "tomorrow".
 *   - **Hours, minutes, seconds** are *exact*, applied as elapsed milliseconds.
 *     PT24H across that same boundary really is 24 hours, and lands an hour
 *     earlier on the clock.
 *
 * This mirrors ISO-8601 and Temporal. Month arithmetic still clamps, so one
 * month after Jan 31 is the end of February rather than spilling into March.
 */
export const addDuration = (date: Date, duration: Duration, timezone = "UTC"): Date => {
  const civil = civilInZone(date, timezone)

  const totalMonths = civil.month - 1 + duration.months + duration.years * 12
  const targetYear = civil.year + Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12

  // Clamp to the target month's length: Jan 31 + P1M is the end of February.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  const shifted: Civil = {
    ...civil,
    day: Math.min(civil.day, lastDay),
    month: targetMonth + 1,
    year: targetYear,
  }

  // Calendar days are added on the civil calendar, then resolved back through
  // the zone — this is what makes the result DST-correct.
  const withDays: Civil = { ...shifted, day: shifted.day + duration.days }
  const afterCalendar = civilToInstant(withDays, timezone)

  const exactMillis = duration.hours * 3_600_000 + duration.minutes * 60_000 + duration.seconds * 1_000

  return new Date(afterCalendar.getTime() + exactMillis)
}

// ── Elapsed time ──────────────────────────────────────────────────────

export type Elapsed = {
  days: number
  /** "future" when `to` is after `from`, "past" when before, "same" when equal. */
  direction: "future" | "past" | "same"
  hours: number
  humanized: string
  milliseconds: number
  minutes: number
  seconds: number
}

/**
 * Exact elapsed time between two instants, broken into whole units.
 *
 * Every component carries the same sign as `milliseconds`, so summing them back
 * up is correct for backward intervals too. `direction` is there so callers can
 * branch without inspecting a sign.
 */
export const between = (from: Date, to: Date): Elapsed => {
  const milliseconds = to.getTime() - from.getTime()
  const abs = Math.abs(milliseconds)
  const sign = milliseconds < 0 ? -1 : 1

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
    days: days * sign,
    direction: milliseconds === 0 ? "same" : milliseconds < 0 ? "past" : "future",
    hours: hours * sign,
    humanized,
    milliseconds,
    minutes: minutes * sign,
    seconds: seconds * sign,
  }
}
